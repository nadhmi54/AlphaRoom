import { describe, expect, it } from 'vitest';
import { buildPanicTuesday } from '../fixtures/panic-tuesday.js';
import { compareRuns } from './replay-analysis.js';

const analysis = compareRuns(buildPanicTuesday(1), buildPanicTuesday(2));
const by = (id: string) => analysis.participants.find((p) => p.participantId === id)!;

describe('comparaison de deux passages', () => {
  it('Amine : exposition 91,8 % → 32,4 %, stop-loss posé, réaction en 2 minutes', () => {
    const amine = by('user-amine');
    expect(amine.before.maxExposure).toBeCloseTo(0.918, 3);
    expect(amine.after.maxExposure).toBeCloseTo(0.324, 3);
    expect(amine.deltas.maxExposure).toBeCloseTo(-0.594, 3);
    expect(amine.before.stopLossRatio).toBe(0);
    expect(amine.after.stopLossRatio).toBe(1);
    expect(amine.before.reactionMeanMinutes).toBeNull();
    expect(amine.after.reactionMeanMinutes).toBe(2);
  });

  it('Amine est jugé « amélioré », avec des constats chiffrés', () => {
    const amine = by('user-amine');
    expect(amine.verdict).toBe('improved');
    expect(amine.deltas.overallScore).toBeGreaterThan(0);
    expect(amine.changes).toContain('Exposition maximale : 91,8 % → 32,4 % du capital.');
    expect(amine.changes.some((c) => c.startsWith('Positions avec stop-loss : 0 %'))).toBe(true);
  });

  it('les autres rejouent à l’identique : aucun changement', () => {
    for (const id of ['user-sarra', 'user-karim', 'user-lina']) {
      expect(by(id).verdict).toBe('unchanged');
      expect(by(id).changes).toEqual(['Comportement identique entre les deux passages.']);
      expect(by(id).deltas.pnl).toBe(0);
    }
  });

  it('résume le groupe', () => {
    expect(analysis.summary).toMatchObject({ improved: 1, unchanged: 3, worsened: 0 });
    expect(analysis.summary.meanScoreAfter!).toBeGreaterThan(analysis.summary.meanScoreBefore!);
    expect(analysis.headline).toContain('Passage 1 → passage 2 : 1 amélioré, 3 inchangés, 0 en baisse sur 4.');
  });

  it('alias stables et noms séparés', () => {
    expect(by('user-amine')).toMatchObject({ alias: 'etu_01', displayName: 'Amine B.' });
    expect(by('user-sarra').alias).toBe('etu_04');
  });

  it('un participant absent d’un passage est compté « non comparable »', () => {
    const after = buildPanicTuesday(2);
    const reduced = { ...after, participants: after.participants.filter((p) => p.id !== 'user-lina') };
    const result = compareRuns(buildPanicTuesday(1), reduced);
    expect(result.notComparable).toBe(1);
    expect(result.participants).toHaveLength(3);
  });

  it('détecte une baisse : le même passage dans l’autre sens', () => {
    const reversed = compareRuns(buildPanicTuesday(2), buildPanicTuesday(1));
    expect(by('user-amine').verdict).toBe('improved');
    expect(reversed.participants.find((p) => p.participantId === 'user-amine')!.verdict).toBe('worsened');
  });
});
