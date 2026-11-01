import { describe, expect, it } from 'vitest';
import { buildPanicTuesday } from '../fixtures/panic-tuesday.js';
import { computeMetrics } from '../metrics/metrics.js';
import { computeOverall, DEFAULT_RUBRIC, formatNumber, scoreParticipant } from './rubric.js';

const session = buildPanicTuesday();
const scoresOf = (id: string) => {
  const { criteria, overall } = scoreParticipant(computeMetrics(session, id));
  return { byId: Object.fromEntries(criteria.map((c) => [c.id, c])), overall };
};

describe('barème par défaut', () => {
  it('les poids totalisent 1', () => {
    expect(DEFAULT_RUBRIC.criteria.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 10);
  });
});

describe('Amine — très exposé, sans protection, sans réaction', () => {
  const { byId, overall } = scoresOf('user-amine');
  it('est insuffisant en gestion du risque : 91,8 % > 80 %', () => {
    expect(byId.gestion_risque).toMatchObject({ status: 'evaluated', score: 1, displayValue: '91,8 %' });
    expect(byId.gestion_risque!.rule).toContain('au-delà de 80 %');
    expect(byId.gestion_risque!.evidence).toContainEqual({ type: 'trade', id: 'a1' });
  });
  it('maîtrise correctement ses pertes : drawdown 2,8 % ≤ 5 %', () => {
    expect(byId.maitrise_pertes).toMatchObject({ score: 3, displayValue: '2,8 %' });
  });
  it('n’a aucune protection : 0 % → 1/4', () => {
    expect(byId.protection_positions).toMatchObject({ score: 1, displayValue: '0 %' });
  });
  it('n’a pas réagi : note la plus basse avec une règle explicite', () => {
    expect(byId.reactivite).toMatchObject({ status: 'evaluated', score: 2, displayValue: 'aucune réaction' });
    expect(byId.reactivite!.rule).toContain('aucune exécution');
  });
  it('ne peut pas juger la qualité des sorties (aucune position fermée)', () => {
    expect(byId.qualite_sorties).toMatchObject({ status: 'not_evaluable', score: null });
    expect(byId.qualite_sorties!.reason).toBeTruthy();
  });
  it('calcule la moyenne pondérée sur les critères évaluables', () => {
    // (0,3×1 + 0,2×3 + 0,2×1 + 0,15×2) / 0,85 = 1,4 / 0,85 = 1,647…
    expect(overall).toMatchObject({ score: 1.65, evaluated: 4, total: 5, partial: true });
  });
});

describe('Sarra — prudente', () => {
  const { byId, overall } = scoresOf('user-sarra');
  it('a une exposition maîtrisée (27 %), une protection systématique (100 %) et réagit en 2 min', () => {
    expect(byId.gestion_risque).toMatchObject({ score: 4, displayValue: '27 %' });
    expect(byId.protection_positions).toMatchObject({ score: 4, displayValue: '100 %' });
    expect(byId.reactivite).toMatchObject({ score: 4, displayValue: '2 min' });
  });
  it('a une très bonne maîtrise des pertes : 0,2 %', () => {
    expect(byId.maitrise_pertes).toMatchObject({ score: 4 });
  });
  it('n’obtient pas de note de sortie : une seule position fermée, perdante', () => {
    expect(byId.qualite_sorties!.status).toBe('not_evaluable');
  });
  it('a une moyenne de 4 sur les quatre critères évaluables', () => {
    expect(overall.score).toBe(4);
  });
});

describe('Karim — gain faible, grosse perte', () => {
  const { byId } = scoresOf('user-karim');
  it('a un ratio gain/perte de 0,17 : faible', () => {
    expect(byId.qualite_sorties).toMatchObject({ score: 1, displayValue: '0,17' });
  });
  it('réagit en moyenne en 1,5 min (1 et 2) : rapide', () => {
    expect(byId.reactivite).toMatchObject({ score: 4, displayValue: '1,5 min' });
  });
});

describe('Lina — ne trade pas', () => {
  const { byId, overall } = scoresOf('user-lina');
  it('n’est évaluable sur aucun critère et n’obtient pas de note', () => {
    expect(Object.values(byId).every((c) => c.status === 'not_evaluable')).toBe(true);
    expect(overall).toMatchObject({ score: null, evaluated: 0, partial: true });
  });
});

describe('computeOverall et formatage', () => {
  it('tient compte de la note corrigée par l’enseignant', () => {
    const overall = computeOverall(
      [
        { status: 'evaluated', score: 1, weight: 0.5, teacherScore: 3 },
        { status: 'evaluated', score: 3, weight: 0.5 },
      ],
      4,
    );
    expect(overall.score).toBe(3);
  });
  it('formate à la française', () => {
    expect(formatNumber(91.8)).toBe('91,8');
    expect(formatNumber(92)).toBe('92');
  });
});
