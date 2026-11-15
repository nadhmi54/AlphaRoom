import { describe, expect, it } from 'vitest';
import { buildProgress, diffReports, effectiveCriterionScore, summarizeClass } from './report-stats.js';
import type { EvaluationReport, ReportCriterion } from './report-types.js';

const criterion = (id: string, score: number | null, extra: Partial<ReportCriterion> = {}): ReportCriterion => ({
  id,
  label: id === 'risque' ? 'Gestion du risque' : 'Maîtrise des pertes',
  weight: 0.5,
  status: score === null ? 'not_evaluable' : 'evaluated',
  value: null,
  displayValue: null,
  score,
  outOf: 4,
  rule: 'règle',
  evidence: [],
  comment: `commentaire ${id}`,
  commentEvidence: [],
  ...extra,
});

const report = (overall: number | null, risque: number | null, pertes: number | null, extra: Partial<EvaluationReport> = {}): EvaluationReport => ({
  alias: 'etu_01',
  session: { id: 's1', run: 1 },
  rubric: { id: 'r', version: 'v1', outOf: 4 },
  criteria: [criterion('risque', risque), criterion('pertes', pertes)],
  overall: { score: overall, outOf: 4, evaluated: 2, total: 2, partial: false },
  summary: 'Synthèse.',
  strengths: [{ text: 'Point fort', evidence: [] }],
  improvements: [{ text: 'À améliorer', evidence: [] }],
  missingData: [],
  ...extra,
});

describe('effectiveCriterionScore', () => {
  it('prend la correction de l’enseignant avant la note calculée', () => {
    expect(effectiveCriterionScore(criterion('risque', 1, { teacherScore: 3 }))).toBe(3);
    expect(effectiveCriterionScore(criterion('risque', 1, { teacherScore: null }))).toBe(1);
  });

  it('ignore un critère non évaluable', () => {
    expect(effectiveCriterionScore(criterion('risque', null))).toBeNull();
  });
});

describe('summarizeClass', () => {
  const rows = [
    { status: 'draft' as const, published: false, content: report(1.5, 1, 1) },
    { status: 'validated' as const, published: false, content: report(2.5, 3, 2) },
    { status: 'validated' as const, published: true, content: report(4, 4, 4) },
  ];

  it('compte les bilans par état et les participants sans bilan', () => {
    const out = summarizeClass(rows, 5);
    expect(out).toMatchObject({ total: 3, drafts: 1, validatedNotPublished: 1, published: 1, expectedParticipants: 5, withoutReport: 2 });
  });

  it('calcule moyenne, médiane, minimum et maximum', () => {
    expect(summarizeClass(rows, null).overall).toEqual({ count: 3, mean: 2.67, median: 2.5, min: 1.5, max: 4 });
  });

  it('répartit les notes par tranche, le maximum tombant dans la dernière', () => {
    expect(summarizeClass(rows, null).distribution).toEqual([
      { from: 0, to: 1, count: 0 },
      { from: 1, to: 2, count: 1 },
      { from: 2, to: 3, count: 1 },
      { from: 3, to: 4, count: 1 },
    ]);
  });

  it('désigne le critère le plus faible et le plus fort de la classe', () => {
    const out = summarizeClass(rows, null);
    expect(out.weakest).toEqual({ id: 'pertes', label: 'Maîtrise des pertes', mean: 2.33 });
    expect(out.strongest).toEqual({ id: 'risque', label: 'Gestion du risque', mean: 2.67 });
  });

  it('tient compte des corrections de l’enseignant', () => {
    const corrected = [{ status: 'draft' as const, published: false, content: { ...report(2, 1, 3), criteria: [criterion('risque', 1, { teacherScore: 4 }), criterion('pertes', 3)] } }];
    expect(summarizeClass(corrected, null).criteria.find((c) => c.id === 'risque')?.mean).toBe(4);
  });

  it('compte les critères non évaluables sans les mettre dans la moyenne', () => {
    const out = summarizeClass([{ status: 'draft', published: false, content: report(2, null, 2) }], null);
    expect(out.criteria.find((c) => c.id === 'risque')).toMatchObject({ mean: null, evaluated: 0, notEvaluated: 1 });
  });

  it('répond proprement quand il n’y a aucun bilan', () => {
    const out = summarizeClass([], 4);
    expect(out).toMatchObject({ total: 0, overall: null, weakest: null, strongest: null, withoutReport: 4 });
    expect(out.distribution).toHaveLength(4);
  });
});

describe('buildProgress', () => {
  const at = (day: number) => new Date(`2026-11-${String(day).padStart(2, '0')}T10:00:00Z`);
  const input = (id: string, day: number, content: EvaluationReport) => ({
    id,
    sessionId: 's1',
    run: 1,
    validatedAt: at(day),
    createdAt: at(1),
    content,
  });

  it('classe les bilans du plus ancien au plus récent', () => {
    const out = buildProgress([input('b', 10, report(3, 3, 3)), input('a', 5, report(2, 2, 2))]);
    expect(out.points.map((p) => p.reportId)).toEqual(['a', 'b']);
  });

  it('mesure l’écart avec le bilan précédent et la tendance de chaque critère', () => {
    const out = buildProgress([input('a', 5, report(2, 1, 3)), input('b', 10, report(2.5, 2, 3))]);
    expect(out.delta).toBe(0.5);
    expect(out.direction).toBe('up');
    expect(out.criteriaTrends).toEqual([
      { id: 'risque', label: 'Gestion du risque', previous: 1, latest: 2, delta: 1 },
      { id: 'pertes', label: 'Maîtrise des pertes', previous: 3, latest: 3, delta: 0 },
    ]);
  });

  it('propose comme piste de travail le critère le plus faible du dernier bilan', () => {
    const out = buildProgress([input('a', 5, report(2, 1, 3)), input('b', 10, report(2.5, 4, 2))]);
    expect(out.focus).toEqual({ id: 'pertes', label: 'Maîtrise des pertes', score: 2 });
  });

  it('ne donne ni écart ni tendance avec un seul bilan', () => {
    const out = buildProgress([input('a', 5, report(2, 1, 3))]);
    expect(out).toMatchObject({ delta: null, direction: null, criteriaTrends: [] });
    expect(out.points).toHaveLength(1);
  });

  it('retourne une progression vide sans bilan', () => {
    expect(buildProgress([])).toEqual({ points: [], delta: null, direction: null, criteriaTrends: [], focus: null });
  });
});

describe('diffReports', () => {
  it('ne dit rien pour une première génération', () => {
    expect(diffReports(null, report(2, 1, 3))).toEqual([]);
  });

  it('ne dit rien quand rien n’a changé', () => {
    expect(diffReports(report(2, 1, 3), report(2, 1, 3))).toEqual([]);
  });

  it('liste la synthèse, la correction de note, le commentaire et la moyenne', () => {
    const before = report(2, 1, 3);
    const after = report(2.5, 1, 3, {
      summary: 'Revu en classe.',
      criteria: [criterion('risque', 1, { teacherScore: 3, comment: 'Mieux.' }), criterion('pertes', 3)],
    });
    expect(diffReports(before, after)).toEqual([
      { field: 'summary', from: 'Synthèse.', to: 'Revu en classe.' },
      { field: 'teacherScore', id: 'risque', label: 'Gestion du risque', from: null, to: 3 },
      { field: 'comment', id: 'risque', label: 'Gestion du risque', from: 'commentaire risque', to: 'Mieux.' },
      { field: 'overall', from: 2, to: 2.5 },
    ]);
  });

  it('repère les points forts et pistes modifiés', () => {
    const after = report(2, 1, 3, { strengths: [{ text: 'Autre', evidence: [] }], improvements: [] });
    expect(diffReports(report(2, 1, 3), after)).toEqual([
      { field: 'strengths', from: ['Point fort'], to: ['Autre'] },
      { field: 'improvements', from: ['À améliorer'], to: [] },
    ]);
  });
});
