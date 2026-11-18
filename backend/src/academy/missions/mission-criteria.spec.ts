import { describe, expect, it } from 'vitest';
import {
  evaluateMission,
  isMissionOpen,
  placementTargetLevel,
  type MissionMetrics,
} from './mission-criteria.js';

const goodMetrics: MissionMetrics = {
  returnPercent: 5,
  maxDrawdown: 0.1,
  sharpe: 1.2,
  ordersCount: 10,
  assetsCount: 4,
  durationSeconds: 600,
};

describe('evaluateMission', () => {
  it('réussit une mission sans critère', () => {
    expect(evaluateMission({}, goodMetrics)).toEqual({ passed: true, checks: [], missing: [] });
  });

  it('réussit quand tous les critères exigés sont satisfaits', () => {
    const evaluation = evaluateMission(
      { minReturnPercent: 3, minSharpe: 1, minOrders: 5, minAssets: 3, minDurationSeconds: 300 },
      goodMetrics,
    );
    expect(evaluation.passed).toBe(true);
    expect(evaluation.missing).toEqual([]);
    expect(evaluation.checks).toHaveLength(5);
  });

  it('échoue et signale ce qui manque', () => {
    const evaluation = evaluateMission(
      { minReturnPercent: 10, minOrders: 20 },
      goodMetrics,
    );
    expect(evaluation.passed).toBe(false);
    expect(evaluation.missing).toEqual(['Rendement minimal', 'Nombre d’ordres minimal']);
  });

  it('exige un drawdown INFÉRIEUR ou égal à la limite', () => {
    expect(evaluateMission({ maxDrawdownLimit: 0.2 }, { maxDrawdown: 0.2 }).passed).toBe(true);
    expect(evaluateMission({ maxDrawdownLimit: 0.2 }, { maxDrawdown: 0.25 }).passed).toBe(false);
  });

  it('échoue quand l’indicateur requis est inconnu', () => {
    const evaluation = evaluateMission({ minSharpe: 0.5 }, { sharpe: null });
    expect(evaluation.passed).toBe(false);
    expect(evaluation.checks[0].actual).toBeNull();
    expect(evaluation.checks[0].satisfied).toBe(false);
  });

  it('ignore une clé de critère inconnue', () => {
    const evaluation = evaluateMission({ critereFutur: 1 } as never, goodMetrics);
    expect(evaluation.passed).toBe(true);
    expect(evaluation.checks).toEqual([]);
  });
});

describe('isMissionOpen', () => {
  const now = new Date('2026-03-01T12:00:00Z');

  it('est ouverte sans fenêtre définie', () => {
    expect(isMissionOpen({ isActive: true, startsAt: null, endsAt: null }, now)).toBe(true);
  });

  it('est fermée si inactive', () => {
    expect(isMissionOpen({ isActive: false, startsAt: null, endsAt: null }, now)).toBe(false);
  });

  it('est fermée avant le début et après la fin', () => {
    expect(
      isMissionOpen({ isActive: true, startsAt: new Date('2026-03-02T00:00:00Z'), endsAt: null }, now),
    ).toBe(false);
    expect(
      isMissionOpen({ isActive: true, startsAt: null, endsAt: new Date('2026-02-28T00:00:00Z') }, now),
    ).toBe(false);
  });

  it('est ouverte dans la fenêtre', () => {
    expect(
      isMissionOpen(
        { isActive: true, startsAt: new Date('2026-02-01T00:00:00Z'), endsAt: new Date('2026-04-01T00:00:00Z') },
        now,
      ),
    ).toBe(true);
  });
});

describe('placementTargetLevel', () => {
  it('place l’élève au niveau de la mission s’il réussit une mission de placement', () => {
    expect(placementTargetLevel({ isPlacement: true, level: 3 }, true)).toBe(3);
  });

  it('ne place personne si la mission n’est pas de placement ou a échoué', () => {
    expect(placementTargetLevel({ isPlacement: false, level: 3 }, true)).toBeNull();
    expect(placementTargetLevel({ isPlacement: true, level: 3 }, false)).toBeNull();
  });
});
