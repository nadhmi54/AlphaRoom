import { describe, expect, it } from 'vitest';
import { UserRole } from '../../users/user-role.enum.js';
import { buildPanicTuesday } from '../fixtures/panic-tuesday.js';
import { StubLlmProvider } from '../llm/stub-llm-provider.js';
import { evaluateParticipant } from '../evaluator/report-evaluator.js';
import { applyReportEdit, ReportEditError } from './report-edit.js';

async function baseReport() {
  const { report } = await evaluateParticipant({
    session: buildPanicTuesday(),
    participantId: 'user-amine',
    requester: { id: 'prof', role: UserRole.GAME_MASTER },
    provider: new StubLlmProvider(() => 'pas du json'),
    maxAttempts: 1,
  });
  return report; // texte de secours : suffisant pour tester l'édition
}

describe('applyReportEdit', () => {
  it('modifie la synthèse et un commentaire sans toucher aux notes calculées', async () => {
    const report = await baseReport();
    const edited = applyReportEdit(report, {
      summary: 'Bilan revu par l’enseignant.',
      criteria: [{ id: 'gestion_risque', comment: 'Discuté en classe.' }],
    });
    expect(edited.summary).toBe('Bilan revu par l’enseignant.');
    expect(edited.criteria.find((c) => c.id === 'gestion_risque')).toMatchObject({ comment: 'Discuté en classe.', score: 1 });
    expect(report.summary).not.toBe(edited.summary); // l'original n'est pas modifié
  });

  it('ajoute une note corrigée, garde la note d’origine et recalcule la moyenne', async () => {
    const report = await baseReport();
    const edited = applyReportEdit(report, { criteria: [{ id: 'gestion_risque', teacherScore: 3 }] });
    const risque = edited.criteria.find((c) => c.id === 'gestion_risque')!;
    expect(risque).toMatchObject({ score: 1, teacherScore: 3 });
    // (0,3×3 + 0,2×3 + 0,2×1 + 0,15×2) / 0,85 = 2,0 / 0,85 = 2,35…
    expect(edited.overall.score).toBe(2.35);
  });

  it('annule une correction avec null', async () => {
    const report = await baseReport();
    const once = applyReportEdit(report, { criteria: [{ id: 'gestion_risque', teacherScore: 3 }] });
    const back = applyReportEdit(once, { criteria: [{ id: 'gestion_risque', teacherScore: null }] });
    expect(back.overall.score).toBe(report.overall.score);
  });

  it('refuse une note hors barème, non entière, ou sur un critère non évalué', async () => {
    const report = await baseReport();
    expect(() => applyReportEdit(report, { criteria: [{ id: 'gestion_risque', teacherScore: 5 }] })).toThrow(ReportEditError);
    expect(() => applyReportEdit(report, { criteria: [{ id: 'gestion_risque', teacherScore: 2.5 }] })).toThrow(ReportEditError);
    expect(() => applyReportEdit(report, { criteria: [{ id: 'qualite_sorties', teacherScore: 2 }] })).toThrow('pas de note à corriger');
  });

  it('refuse un critère inconnu, une synthèse vide ou trop longue', async () => {
    const report = await baseReport();
    expect(() => applyReportEdit(report, { criteria: [{ id: 'x', comment: 'a' }] })).toThrow('Critère inconnu');
    expect(() => applyReportEdit(report, { summary: '  ' })).toThrow('vide');
    expect(() => applyReportEdit(report, { summary: 'a'.repeat(900) })).toThrow('dépasse');
  });

  it('remplace les points forts et refuse une liste trop longue ou un texte vide', async () => {
    const report = await baseReport();
    const edited = applyReportEdit(report, { strengths: [{ text: ' Bien ', evidence: [{ type: 'minute', value: 3 }] }] });
    expect(edited.strengths).toEqual([{ text: 'Bien', evidence: [{ type: 'minute', value: 3 }] }]);
    const six = Array.from({ length: 6 }, () => ({ text: 'x', evidence: [] }));
    expect(() => applyReportEdit(report, { improvements: six })).toThrow('5 éléments');
    expect(() => applyReportEdit(report, { improvements: [{ text: '', evidence: [] }] })).toThrow('obligatoire');
  });
});
