import { describe, expect, it } from 'vitest';
import { buildParticipantContext } from '../context/ai-context.js';
import { buildPanicTuesday } from '../fixtures/panic-tuesday.js';
import { computeMetrics } from '../metrics/metrics.js';
import { scoreParticipant } from '../rubric/rubric.js';
import { UserRole } from '../../users/user-role.enum.js';
import { buildFallbackParts } from './fallback-report.js';
import { validateReportParts } from './report-validator.js';

const teacher = { id: 'prof', role: UserRole.GAME_MASTER };

function parts(run: number, id: string) {
  const session = buildPanicTuesday(run);
  const { criteria, overall } = scoreParticipant(computeMetrics(session, id));
  return { session, criteria, overall, parts: buildFallbackParts(criteria, overall) };
}

describe('texte de secours généré par le code', () => {
  it('explique en langage clair au lieu de répéter la règle', () => {
    const { criteria, parts: p } = parts(1, 'user-amine');
    const risk = p.criteria.find((c) => c.id === 'gestion_risque')!;
    expect(risk.comment).toContain('91,8 %');
    expect(risk.comment).not.toBe(criteria.find((c) => c.id === 'gestion_risque')!.rule);
    expect(p.summary).toContain('Note globale : 1,65 sur 4.');
    expect(p.summary).toContain('À travailler en priorité');
  });

  it('propose des pistes pour les critères faibles et des points forts pour les bons', () => {
    const amine = parts(1, 'user-amine').parts;
    expect(amine.improvements.map((i) => i.text)).toContain('Réduis la taille de tes positions : ton exposition maximale a atteint 91,8 % du capital.');
    expect(amine.strengths.map((s) => s.text)).toContain('Pertes contenues : ta plus forte baisse a été de 2,8 %.');
    const sarra = parts(1, 'user-sarra').parts;
    expect(sarra.strengths.length).toBeGreaterThan(0);
  });

  it('signale la réaction absente sans inventer de chiffre', () => {
    const text = parts(1, 'user-amine').parts.criteria.find((c) => c.id === 'reactivite')!.comment;
    expect(text).toContain('aucun ordre après les événements');
  });

  it('une étudiante sans ordre : rien n’est inventé', () => {
    const lina = parts(1, 'user-lina');
    expect(lina.parts.strengths.length + lina.parts.improvements.length).toBeLessThanOrEqual(5);
    expect(lina.parts.criteria.every((c) => c.comment.length > 0)).toBe(true);
  });

  it('tous les textes de secours passent le validateur, pour tous les profils et les deux passages', () => {
    for (const run of [1, 2]) {
      for (const id of ['user-amine', 'user-sarra', 'user-karim', 'user-lina']) {
        const { session, criteria, overall, parts: p } = parts(run, id);
        const context = buildParticipantContext(session, id, teacher);
        const result = validateReportParts(JSON.stringify(p), context, criteria, overall);
        expect(result.issues, `${id} passage ${run}`).toEqual([]);
        expect(result.ok).toBe(true);
      }
    }
  });
});
