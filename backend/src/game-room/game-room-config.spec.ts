import { describe, expect, it } from 'vitest';
import {
  resolveTimeModel,
  syntheticPrice,
  TIMEFRAME_SECONDS,
} from './game-room-config.js';

describe('Game Room - Modèle de temps configurable', () => {
  it('impose la durée du scénario et en déduit la vitesse de relecture', () => {
    const model = resolveTimeModel({ sourceMode: 'scenario', durationMinutes: 30 });
    expect(model.totalSimSeconds).toBe(1800);
    expect(model.playbackSpeed).toBe(1);
    expect(model.historyStartAt).toBeNull();
  });

  it('rejette 6 h d\'historique en 30 min à 12x', () => {
    const model = resolveTimeModel({ sourceMode: 'historical', durationMinutes: 30, datasetSeconds: 6 * 3600 });
    expect(model.totalSimSeconds).toBe(21600);
    expect(model.playbackSpeed).toBe(12);
  });

  it('calcule la fenêtre historique à partir de la durée du jeu de données', () => {
    const end = new Date('2026-10-30T15:00:00.000Z');
    const model = resolveTimeModel({
      sourceMode: 'csv',
      durationMinutes: 10,
      datasetSeconds: 3600,
      historyEnd: end,
    });
    expect(model.playbackSpeed).toBe(6);
    expect(model.historyEndAt?.toISOString()).toBe(end.toISOString());
    expect(model.historyStartAt?.toISOString()).toBe('2026-10-30T14:00:00.000Z');
  });

  it('force le temps réel (1x) en mode live', () => {
    const model = resolveTimeModel({ sourceMode: 'live', durationMinutes: 15, playbackSpeed: 8 });
    expect(model.playbackSpeed).toBe(1);
    expect(model.totalSimSeconds).toBe(900);
  });

  it('conserve la vitesse demandée pour un marché synthétique', () => {
    const model = resolveTimeModel({ sourceMode: 'synthetic', durationMinutes: 5, playbackSpeed: 4 });
    expect(model.playbackSpeed).toBe(4);
    expect(model.totalSimSeconds).toBe(1200);
  });

  it('retombe sur des valeurs sûres pour une durée ou un timeframe invalide', () => {
    const model = resolveTimeModel({ sourceMode: 'scenario', durationMinutes: 0, timeframe: '2m' });
    expect(model.durationMinutes).toBe(1);
    expect(model.timeframe).toBe('1m');
    expect(TIMEFRAME_SECONDS[model.timeframe]).toBe(60);
  });
});

describe('Game Room - Marché synthétique', () => {
  const config = { initialPrice: 2700, volatilityPercent: 5, trendPercent: -3, seed: 42 };

  it('démarre au prix initial configuré', () => {
    expect(syntheticPrice(0, 1800, config)).toBe(2700);
  });

  it('produit exactement la même série pour deux participants (mêmes appels)', () => {
    const a = [0, 300, 900, 1500, 1800].map((t) => syntheticPrice(t, 1800, config));
    const b = [0, 300, 900, 1500, 1800].map((t) => syntheticPrice(t, 1800, config));
    expect(a).toEqual(b);
  });

  it('applique la tendance demandée sur toute la séance', () => {
    const end = syntheticPrice(1800, 1800, config);
    // -3 % de dérive, bruit de volatilité 5 % : le prix reste proche de 2619.
    expect(end).toBeGreaterThan(2700 * 0.85);
    expect(end).toBeLessThan(2700 * 1.05);
  });

  it('réagit aux événements planifiés', () => {
    const shocked = syntheticPrice(1000, 1800, {
      ...config,
      events: [{ atPercent: 50, priceJumpPercent: -10, label: 'Flash' }],
    });
    const calm = syntheticPrice(1000, 1800, config);
    expect(shocked).toBeCloseTo(calm * 0.9, 1);
  });

  it('change de série quand la graine change', () => {
    const a = syntheticPrice(900, 1800, { ...config, seed: 1 });
    const b = syntheticPrice(900, 1800, { ...config, seed: 2 });
    expect(a).not.toBe(b);
  });
});
