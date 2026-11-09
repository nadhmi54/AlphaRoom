import { describe, expect, it } from 'vitest';
import { evaluateRuleConditions, readRuleConditions } from './rule-conditions.js';

describe('readRuleConditions', () => {
  it('ne conserve que les clés connues', () => {
    const conditions = readRuleConditions({ minScore: 60, minOrders: 3, inconnu: 'x' });
    expect(conditions.minScore).toBe(60);
    expect(conditions.minOrders).toBe(3);
    expect((conditions as Record<string, unknown>).inconnu).toBeUndefined();
  });

  it('écarte les valeurs non numériques', () => {
    const conditions = readRuleConditions({ minScore: 'soixante', minOrders: 3 });
    expect(conditions.minScore).toBeUndefined();
    expect(conditions.minOrders).toBe(3);
  });

  it('lit les pondérations partielles du Score Académie', () => {
    const conditions = readRuleConditions({ weights: { returnPercent: 0.5, drawdown: 'x' } });
    expect(conditions.weights).toEqual({ returnPercent: 0.5 });
  });

  it('tolère un JSON vide ou mal formé', () => {
    expect(readRuleConditions(null)).toEqual({});
    expect(readRuleConditions('texte')).toEqual({});
  });
});

describe('evaluateRuleConditions', () => {
  it('réussit sans condition', () => {
    expect(evaluateRuleConditions({}, { returnPercent: 1 }).passed).toBe(true);
  });

  it('échoue quand le nombre d’ordres minimal n’est pas atteint', () => {
    const result = evaluateRuleConditions({ minOrders: 5 }, { ordersCount: 2 });
    expect(result.passed).toBe(false);
    expect(result.missing).toContain('Nombre d’ordres minimal');
  });

  it('échoue quand la limite de drawdown est dépassée (aucune récompense)', () => {
    const result = evaluateRuleConditions({ maxDrawdownLimit: 0.2 }, { maxDrawdown: 0.35 });
    expect(result.passed).toBe(false);
    expect(result.missing).toContain('Drawdown maximal autorisé');
  });

  it('échoue quand la durée minimale n’est pas atteinte', () => {
    const result = evaluateRuleConditions({ minDurationSeconds: 300 }, { durationSeconds: 120 });
    expect(result.passed).toBe(false);
  });

  it('échoue quand le Score Académie est sous le seuil', () => {
    const result = evaluateRuleConditions({ minScore: 80 }, { returnPercent: 1, sharpe: 0.2 });
    expect(result.passed).toBe(false);
    expect(result.missing).toContain('Score Académie minimal');
  });

  it('réussit quand toutes les conditions sont satisfaites', () => {
    const result = evaluateRuleConditions(
      { minScore: 50, minOrders: 3, maxDrawdownLimit: 0.3, minDurationSeconds: 60 },
      { returnPercent: 8, sharpe: 1.5, maxDrawdown: 0.05, ordersCount: 4, durationSeconds: 120 },
    );
    expect(result.passed).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('échoue quand le scénario ne correspond pas', () => {
    const result = evaluateRuleConditions(
      { scenarioId: 'panic_tuesday' },
      { returnPercent: 1 },
      { scenarioId: 'autre_scenario' },
    );
    expect(result.passed).toBe(false);
    expect(result.missing).toContain('Scénario attendu');
  });

  it('vérifie la série de jours quand elle est exigée', () => {
    const passed = evaluateRuleConditions({ minStreakDays: 3 }, {}, { streakDays: 5 });
    const failed = evaluateRuleConditions({ minStreakDays: 3 }, {}, { streakDays: 1 });
    expect(passed.passed).toBe(true);
    expect(failed.passed).toBe(false);
    expect(failed.missing).toContain('Série de jours minimale');
  });

  it('expose le Score Académie calculé', () => {
    const result = evaluateRuleConditions({}, { returnPercent: 10, sharpe: 2, maxDrawdown: 0 });
    expect(result.score).toBe(100);
  });
});
