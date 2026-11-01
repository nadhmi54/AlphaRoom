// @ts-ignore
import { describe, expect, it } from 'vitest';
import {
  PerformanceMetricsService,
  TRADING_DAYS_PER_YEAR,
} from './performance-metrics.service.js';

// Les séries ci-dessous sont choisies pour que le résultat soit vérifiable à la
// main : on recalcule l'attendu sur papier plutôt que de figer une sortie.
const metrics = new PerformanceMetricsService();

describe('PerformanceMetricsService.computeDailyReturns', () => {
  it('convertit une série de valeurs en variations successives', () => {
    const [up, down] = metrics.computeDailyReturns([100, 110, 99]);
    expect(up).toBeCloseTo(0.1, 10); // 110 / 100 - 1
    expect(down).toBeCloseTo(-0.1, 10); // 99 / 110 - 1
  });

  it('ne produit aucun rendement pour une série vide ou à un seul point', () => {
    expect(metrics.computeDailyReturns([])).toEqual([]);
    expect(metrics.computeDailyReturns([100])).toEqual([]);
  });

  it('renvoie 0 quand la valeur précédente est nulle (pas d’Infinity)', () => {
    expect(metrics.computeDailyReturns([0, 100])).toEqual([0]);
  });
});

describe('PerformanceMetricsService.computeVolatility', () => {
  it('vaut 0 sur une série constante, annualisée ou non', () => {
    expect(metrics.computeVolatility([0.01, 0.01, 0.01])).toBe(0);
    expect(metrics.computeVolatility([0.01, 0.01, 0.01], false)).toBe(0);
  });

  it('vaut 0 tant qu’il n’y a pas deux rendements', () => {
    expect(metrics.computeVolatility([])).toBe(0);
    expect(metrics.computeVolatility([0.02])).toBe(0);
  });

  it('annualise en multipliant par racine de 252', () => {
    // [0.01, -0.01] : moyenne 0, variance échantillon 0.0002, écart-type 0.01414214.
    const daily = Math.sqrt(0.0002);
    expect(metrics.computeVolatility([0.01, -0.01], false)).toBeCloseTo(daily, 8);
    expect(metrics.computeVolatility([0.01, -0.01])).toBeCloseTo(
      daily * Math.sqrt(TRADING_DAYS_PER_YEAR),
      8,
    );
  });
});

describe('PerformanceMetricsService.computeMaxDrawdown', () => {
  it('mesure la pire baisse depuis un plus haut', () => {
    // 100 → 120 (sommet) → 90 : (120 - 90) / 120 = 0.25.
    expect(metrics.computeMaxDrawdown([100, 120, 90, 130])).toBeCloseTo(0.25, 8);
  });

  it('vaut 0 quand la valeur ne baisse jamais', () => {
    expect(metrics.computeMaxDrawdown([100, 100, 100])).toBe(0);
    expect(metrics.computeMaxDrawdown([100, 110, 120])).toBe(0);
  });

  it('vaut 0 sur une série vide', () => {
    expect(metrics.computeMaxDrawdown([])).toBe(0);
  });

  it('détecte une baisse de 50 %', () => {
    expect(metrics.computeMaxDrawdown([100, 50])).toBeCloseTo(0.5, 8);
  });
});

describe('PerformanceMetricsService.computeVaR', () => {
  // 10 rendements ; à 95 % le quantile bas est le rang 0 (floor(0.05 × 10)).
  const returns = [-0.05, -0.02, 0.01, 0.02, 0.03, -0.1, 0.04, 0.05, 0.06, 0.07];

  it('retient le pire rendement au quantile 95 %', () => {
    expect(metrics.computeVaR(returns)).toBeCloseTo(0.1, 8);
  });

  it('abaisse la perte quand on baisse le seuil de confiance', () => {
    // À 90 % : rang 1 de la série triée (-0.05) → perte de 0.05.
    expect(metrics.computeVaR(returns, 0.9)).toBeCloseTo(0.05, 8);
  });

  it('vaut 0 sans aucun rendement', () => {
    expect(metrics.computeVaR([])).toBe(0);
  });

  it('renvoie une valeur négative si même le pire rendement est positif', () => {
    expect(metrics.computeVaR([0.01, 0.02])).toBeCloseTo(-0.01, 8);
  });
});

describe('PerformanceMetricsService.computeSharpeRatio', () => {
  const returns = [0.02, -0.01, 0.03, -0.02, 0.01];

  it('annualise le rapport rendement excédentaire / écart-type', () => {
    // Moyenne 0.006 ; écart-type échantillon 0.02073644 ; × √252 → ≈ 4.593.
    expect(metrics.computeSharpeRatio(returns)).toBeCloseTo(4.593, 2);
  });

  it('retranche un taux sans risque annualisé ramené au jour', () => {
    // Taux 25.2 %/an → 0.001/jour : la moyenne passe à 0.005, l’écart-type ne change pas.
    expect(metrics.computeSharpeRatio(returns, 0.252)).toBeCloseTo(3.828, 2);
  });

  it('vaut 0 sans dispersion (aucune division par zéro)', () => {
    expect(metrics.computeSharpeRatio([0.01, 0.01, 0.01])).toBe(0);
  });

  it('vaut 0 tant qu’il n’y a pas deux rendements', () => {
    expect(metrics.computeSharpeRatio([])).toBe(0);
    expect(metrics.computeSharpeRatio([0.02])).toBe(0);
  });
});
