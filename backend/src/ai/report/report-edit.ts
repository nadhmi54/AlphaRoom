import { computeOverall } from '../rubric/rubric.js';
import { LIMITS } from './report-validator.js';
import type { EvaluationReport, ReportPoint } from './report-types.js';

/** Modification apportée par l'enseignant à un brouillon. Tout champ absent est conservé. */
export interface ReportEdit {
  summary?: string;
  criteria?: Array<{ id: string; comment?: string; teacherScore?: number | null }>;
  strengths?: ReportPoint[];
  improvements?: ReportPoint[];
}

export class ReportEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportEditError';
  }
}

const EVIDENCE_TYPES = new Set(['trade', 'event', 'minute']);

function cleanPoints(points: ReportPoint[], name: string): ReportPoint[] {
  if (points.length > LIMITS.points) throw new ReportEditError(`« ${name} » : ${LIMITS.points} éléments au plus.`);
  return points.map((point, index) => {
    const text = (point.text ?? '').trim();
    if (!text) throw new ReportEditError(`${name}[${index}] : le texte est obligatoire.`);
    if (text.length > LIMITS.point) throw new ReportEditError(`${name}[${index}] : ${LIMITS.point} caractères au plus.`);
    const evidence = Array.isArray(point.evidence) ? point.evidence : [];
    for (const item of evidence) {
      if (!item || !EVIDENCE_TYPES.has((item as { type: string }).type)) {
        throw new ReportEditError(`${name}[${index}] : preuve invalide.`);
      }
    }
    return { text, evidence };
  });
}

/**
 * Applique les corrections de l'enseignant et recalcule la moyenne. La note
 * d'origine (calculée par le code) est conservée dans `score` : la note
 * corrigée est ajoutée à part dans `teacherScore`, pour que la correction
 * reste visible et réversible.
 */
export function applyReportEdit(report: EvaluationReport, edit: ReportEdit): EvaluationReport {
  const next: EvaluationReport = structuredClone(report);

  if (edit.summary !== undefined) {
    const summary = edit.summary.trim();
    if (!summary) throw new ReportEditError('La synthèse ne peut pas être vide.');
    if (summary.length > LIMITS.summary) throw new ReportEditError(`La synthèse dépasse ${LIMITS.summary} caractères.`);
    next.summary = summary;
  }

  for (const change of edit.criteria ?? []) {
    const criterion = next.criteria.find((c) => c.id === change.id);
    if (!criterion) throw new ReportEditError(`Critère inconnu : ${change.id}.`);
    if (change.comment !== undefined) {
      const comment = change.comment.trim();
      if (comment.length > LIMITS.comment) throw new ReportEditError(`Commentaire trop long (${change.id}).`);
      criterion.comment = comment;
    }
    if (change.teacherScore !== undefined) {
      if (change.teacherScore === null) {
        delete criterion.teacherScore;
      } else {
        if (criterion.status !== 'evaluated') throw new ReportEditError(`Le critère ${change.id} n’est pas évalué : pas de note à corriger.`);
        if (!Number.isInteger(change.teacherScore) || change.teacherScore < 0 || change.teacherScore > criterion.outOf) {
          throw new ReportEditError(`La note de ${change.id} doit être un entier entre 0 et ${criterion.outOf}.`);
        }
        criterion.teacherScore = change.teacherScore;
      }
    }
  }

  if (edit.strengths !== undefined) next.strengths = cleanPoints(edit.strengths, 'strengths');
  if (edit.improvements !== undefined) next.improvements = cleanPoints(edit.improvements, 'improvements');

  next.overall = computeOverall(next.criteria, next.rubric.outOf);
  return next;
}
