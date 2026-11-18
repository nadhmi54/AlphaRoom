import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCORE_WEIGHTS,
  computeRiskAdjustedScore,
  normalizeWeights,
} from './risk-score.js';

describe('normalizeWeights', () => {
  it('renvoie les pondérations par défaut quand rien n’est fourni', () => {
    expect(normalizeWeights()).toEqual(DEFAULT_SCORE_WEIGHTS);
  });

  it('ramène la somme des pondérations à 1', () => {
    const weights = normalizeWeights({ returnPercent: 2, sharpe: 1, drawdown: 1 });
    expect(weights.returnPercent).toBeCloseTo(0.5, 6);
    expect(weights.sharpe).toBeCloseTo(0.25, 6);
    expect(weights.drawdown).toBeCloseTo(0.25, 6);
  });

  it('remplace un poids négatif par le défaut et conserve un poids nul explicite', () => {
    const weights = normalizeWeights({ returnPercent: 0, sharpe: -1, drawdown: 1 });
    expect(weights.returnPercent).toBe(0);
    expect(weights.sharpe).toBeGreaterThan(0);
    expect(weights.returnPercent + weights.sharpe + weights.drawdown).toBeCloseTo(1, 6);
  });
});

describe('computeRiskAdjustedScore', () => {
  it('vaut 0 quand toutes les données sont absentes', () => {
    expect(computeRiskAdjustedScore(null)).toBe(0);
    expect(computeRiskAdjustedScore({})).toBe(0);
  });

  it('vaut 100 quand chaque composante atteint sa cible', () => {
    const score = computeRiskAdjustedScore({
      returnPercent: 10,
      sharpe: 2,
      maxDrawdown: 0,
    });
    expect(score).toBe(100);
  });

  it('pénalise un drawdown approchant la limite', () => {
    const withoutDrawdown = computeRiskAdjustedScore({ returnPercent: 10, sharpe: 2, maxDrawdown: 0 });
    const withDrawdown = computeRiskAdjustedScore({ returnPercent: 10, sharpe: 2, maxDrawdown: 0.1 });
    expect(withDrawdown).toBeLessThan(withoutDrawdown);
  });

  it('ignore un rendement ou un Sharpe négatif (composante à 0)', () => {
    const score = computeRiskAdjustedScore({ returnPercent: -5, sharpe: -1, maxDrawdown: 0 });
    expect(score).toBe(30); // seule la composante drawdown rapporte 0,3 × 100
  });

  it('plafonne chaque composante à 1', () => {
    const score = computeRiskAdjustedScore({ returnPercent: 1000, sharpe: 1000, maxDrawdown: 0 });
    expect(score).toBe(100);
  });

  it('respecte des pondérations personnalisées', () => {
    const score = computeRiskAdjustedScore(
      { returnPercent: 10, sharpe: 0, maxDrawdown: 0.2 },
      { weights: { returnPercent: 1, sharpe: 0, drawdown: 0 } },
    );
    // 100 % rendement (cible atteinte), drawdown ignoré malgré la limite atteinte.
    expect(score).toBe(100);
  });

  it('arrondit le score au centième', () => {
    const score = computeRiskAdjustedScore({ returnPercent: 3.333, sharpe: 1.111, maxDrawdown: 0.033 });
    expect(score).toBe(Math.round(score * 100) / 100);
  });
});
