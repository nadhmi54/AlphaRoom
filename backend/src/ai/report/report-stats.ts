import type { EvaluationReport, ReportCriterion } from './report-types.js';

/**
 * Calculs purs sur les bilans : synthèse de classe, progression d'un étudiant,
 * différences entre deux versions. Aucun appel au modèle : tout vient des
 * notes déjà calculées par le barème (et des corrections de l'enseignant).
 */

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

/** Note retenue pour un critère : la correction de l'enseignant remplace la note calculée. */
export function effectiveCriterionScore(criterion: ReportCriterion): number | null {
  if (criterion.status !== 'evaluated') return null;
  return criterion.teacherScore ?? criterion.score ?? null;
}

const mean = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/* ------------------------------------------------------------------ */
/* Synthèse de classe                                                  */
/* ------------------------------------------------------------------ */

export interface ReportForSummary {
  status: 'draft' | 'validated';
  published: boolean;
  content: EvaluationReport;
}

export interface ClassCriterionStat {
  id: string;
  label: string;
  /** Moyenne des notes retenues ; null si aucun bilan n'a pu évaluer ce critère. */
  mean: number | null;
  /** Nombre de bilans où le critère a été évalué. */
  evaluated: number;
  notEvaluated: number;
}

export interface ClassSummary {
  total: number;
  drafts: number;
  validatedNotPublished: number;
  published: number;
  /** Participants de la séance (null si la simulation n'est pas joignable). */
  expectedParticipants: number | null;
  withoutReport: number | null;
  outOf: number;
  overall: { count: number; mean: number; median: number; min: number; max: number } | null;
  /** Une tranche par point de la note : [0,1[, [1,2[… la dernière inclut le maximum. */
  distribution: Array<{ from: number; to: number; count: number }>;
  criteria: ClassCriterionStat[];
  weakest: { id: string; label: string; mean: number } | null;
  strongest: { id: string; label: string; mean: number } | null;
}

export function summarizeClass(reports: ReportForSummary[], expectedParticipants: number | null): ClassSummary {
  const outOf = reports[0]?.content.overall.outOf ?? 4;
  const scores = reports.map((r) => r.content.overall.score).filter((s): s is number => typeof s === 'number');

  const distribution = Array.from({ length: outOf }, (_, i) => ({ from: i, to: i + 1, count: 0 }));
  for (const score of scores) {
    const index = Math.min(Math.floor(score), outOf - 1);
    distribution[Math.max(index, 0)]!.count += 1;
  }

  const byCriterion = new Map<string, { label: string; values: number[]; notEvaluated: number }>();
  for (const report of reports) {
    for (const criterion of report.content.criteria) {
      const entry = byCriterion.get(criterion.id) ?? { label: criterion.label, values: [], notEvaluated: 0 };
      const value = effectiveCriterionScore(criterion);
      if (value === null) entry.notEvaluated += 1;
      else entry.values.push(value);
      byCriterion.set(criterion.id, entry);
    }
  }
  const criteria: ClassCriterionStat[] = [...byCriterion.entries()].map(([id, entry]) => ({
    id,
    label: entry.label,
    mean: entry.values.length > 0 ? round(mean(entry.values)) : null,
    evaluated: entry.values.length,
    notEvaluated: entry.notEvaluated,
  }));

  const ranked = criteria
    .filter((c): c is ClassCriterionStat & { mean: number } => c.mean !== null)
    .sort((a, b) => a.mean - b.mean);

  return {
    total: reports.length,
    drafts: reports.filter((r) => r.status === 'draft').length,
    validatedNotPublished: reports.filter((r) => r.status === 'validated' && !r.published).length,
    published: reports.filter((r) => r.status === 'validated' && r.published).length,
    expectedParticipants,
    withoutReport: expectedParticipants === null ? null : Math.max(expectedParticipants - reports.length, 0),
    outOf,
    overall:
      scores.length === 0
        ? null
        : {
            count: scores.length,
            mean: round(mean(scores)),
            median: round(median(scores)),
            min: round(Math.min(...scores)),
            max: round(Math.max(...scores)),
          },
    distribution,
    criteria,
    weakest: ranked[0] ? { id: ranked[0].id, label: ranked[0].label, mean: ranked[0].mean } : null,
    strongest: ranked.length > 1 ? { id: ranked.at(-1)!.id, label: ranked.at(-1)!.label, mean: ranked.at(-1)!.mean } : null,
  };
}

/* ------------------------------------------------------------------ */
/* Progression d'un étudiant                                           */
/* ------------------------------------------------------------------ */

export interface ReportForProgress {
  id: string;
  sessionId: string;
  run: number;
  validatedAt: Date | null;
  createdAt: Date;
  content: EvaluationReport;
}

export interface ProgressPoint {
  reportId: string;
  sessionId: string;
  run: number;
  at: Date;
  overall: { score: number | null; outOf: number };
  criteria: Array<{ id: string; label: string; score: number | null; outOf: number }>;
}

export interface Progress {
  points: ProgressPoint[];
  /** Écart entre le dernier bilan et le précédent (null s'il y en a moins de deux). */
  delta: number | null;
  direction: 'up' | 'down' | 'flat' | null;
  /** Évolution critère par critère, dernier bilan comparé au précédent. */
  criteriaTrends: Array<{ id: string; label: string; previous: number; latest: number; delta: number }>;
  /** Critère le plus faible du dernier bilan : la piste de travail la plus utile. */
  focus: { id: string; label: string; score: number } | null;
}

export function buildProgress(reports: ReportForProgress[]): Progress {
  const points: ProgressPoint[] = reports
    .map((report) => ({
      reportId: report.id,
      sessionId: report.sessionId,
      run: report.run,
      at: report.validatedAt ?? report.createdAt,
      overall: { score: report.content.overall.score, outOf: report.content.overall.outOf },
      criteria: report.content.criteria.map((c) => ({
        id: c.id,
        label: c.label,
        score: effectiveCriterionScore(c),
        outOf: c.outOf,
      })),
    }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const latest = points.at(-1);
  const previous = points.at(-2);

  let delta: number | null = null;
  let direction: Progress['direction'] = null;
  if (latest && previous && latest.overall.score !== null && previous.overall.score !== null) {
    delta = round(latest.overall.score - previous.overall.score);
    direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  }

  const criteriaTrends: Progress['criteriaTrends'] = [];
  if (latest && previous) {
    for (const criterion of latest.criteria) {
      const before = previous.criteria.find((c) => c.id === criterion.id);
      if (criterion.score !== null && before && before.score !== null) {
        criteriaTrends.push({
          id: criterion.id,
          label: criterion.label,
          previous: before.score,
          latest: criterion.score,
          delta: round(criterion.score - before.score),
        });
      }
    }
  }

  const evaluatedLatest = (latest?.criteria ?? []).filter((c): c is typeof c & { score: number } => c.score !== null);
  const weakest = evaluatedLatest.sort((a, b) => a.score - b.score)[0];

  return {
    points,
    delta,
    direction,
    criteriaTrends,
    focus: weakest ? { id: weakest.id, label: weakest.label, score: weakest.score } : null,
  };
}

/* ------------------------------------------------------------------ */
/* Différences entre deux versions d'un bilan                          */
/* ------------------------------------------------------------------ */

export type ReportChange =
  | { field: 'summary'; from: string; to: string }
  | { field: 'overall'; from: number | null; to: number | null }
  | { field: 'teacherScore'; id: string; label: string; from: number | null; to: number | null }
  | { field: 'comment'; id: string; label: string; from: string; to: string }
  | { field: 'strengths' | 'improvements'; from: string[]; to: string[] };

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, i) => value === b[i]);

export function diffReports(before: EvaluationReport | null, after: EvaluationReport): ReportChange[] {
  if (!before) return [];
  const changes: ReportChange[] = [];

  if (before.summary !== after.summary) changes.push({ field: 'summary', from: before.summary, to: after.summary });

  for (const criterion of after.criteria) {
    const old = before.criteria.find((c) => c.id === criterion.id);
    if (!old) continue;
    const from = old.teacherScore ?? null;
    const to = criterion.teacherScore ?? null;
    if (from !== to) changes.push({ field: 'teacherScore', id: criterion.id, label: criterion.label, from, to });
    if (old.comment !== criterion.comment) {
      changes.push({ field: 'comment', id: criterion.id, label: criterion.label, from: old.comment, to: criterion.comment });
    }
  }

  for (const field of ['strengths', 'improvements'] as const) {
    const from = before[field].map((p) => p.text);
    const to = after[field].map((p) => p.text);
    if (!sameList(from, to)) changes.push({ field, from, to });
  }

  if (before.overall.score !== after.overall.score) {
    changes.push({ field: 'overall', from: before.overall.score, to: after.overall.score });
  }
  return changes;
}
