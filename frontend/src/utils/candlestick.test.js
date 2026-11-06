import { describe, expect, it } from 'vitest';
import {
  aggregateToCandles,
  toSeconds,
  updateCandlesWithTick,
} from './candlestick.js';

describe('toSeconds', () => {
  it('convertit les millisecondes epoch en secondes', () => {
    expect(toSeconds(1700000000000)).toBe(1700000000);
  });

  it('garde les secondes intactes', () => {
    expect(toSeconds(600)).toBe(600);
  });

  it('parse une chaîne ISO', () => {
    expect(toSeconds('2026-10-25T10:00:00Z')).toBe(1792922400);
  });

  it('gère les valeurs null ou undefined', () => {
    expect(toSeconds(null)).toBe(0);
    expect(toSeconds(undefined)).toBe(0);
  });
});

describe('aggregateToCandles', () => {
  it('renvoie un tableau vide pour un intervalle ou une liste vide', () => {
    expect(aggregateToCandles([], 5)).toEqual([]);
    expect(aggregateToCandles(null, 5)).toEqual([]);
    expect(aggregateToCandles(undefined, 5)).toEqual([]);
  });

  it('gère un tick unique (single tick) sans inventer de prix', () => {
    const single = [{ t: 10, price: 150.5 }];
    const candles = aggregateToCandles(single, 5);

    expect(candles).toHaveLength(1);
    expect(candles[0]).toEqual({
      time: 10,
      open: 150.5,
      high: 150.5,
      low: 150.5,
      close: 150.5,
    });
  });

  it('agrège plusieurs ticks dans le même intervalle', () => {
    const ticks = [
      { t: 0, price: 100 },
      { t: 1, price: 105 },
      { t: 2, price: 95 },
      { t: 3, price: 102 },
      { t: 4, price: 101 },
    ];
    const candles = aggregateToCandles(ticks, 5);

    expect(candles).toHaveLength(1);
    expect(candles[0]).toEqual({
      time: 0,
      open: 100,
      high: 105,
      low: 95,
      close: 101,
    });
  });

  it('crée plusieurs bougies pour des ticks étalés sur plusieurs intervalles', () => {
    const ticks = [
      // Intervalle 0..4 (bucket 0)
      { t: 0, price: 100 },
      { t: 2, price: 108 },
      // Intervalle 5..9 (bucket 5)
      { t: 5, price: 107 },
      { t: 6, price: 99 },
      { t: 9, price: 104 },
      // Intervalle 10..14 (bucket 10)
      { t: 10, price: 104 },
      { t: 12, price: 112 },
    ];
    const candles = aggregateToCandles(ticks, 5);

    expect(candles).toHaveLength(3);
    expect(candles[0]).toEqual({ time: 0, open: 100, high: 108, low: 100, close: 108 });
    expect(candles[1]).toEqual({ time: 5, open: 107, high: 107, low: 99, close: 104 });
    expect(candles[2]).toEqual({ time: 10, open: 104, high: 112, low: 104, close: 112 });
  });

  it('réutilise directement les données déjà au format OHLC', () => {
    const ohlcPoints = [
      { t: 0, open: 50, high: 55, low: 48, close: 53 },
      { t: 60, open: 53, high: 58, low: 52, close: 57 },
    ];
    const candles = aggregateToCandles(ohlcPoints, 60);

    expect(candles).toHaveLength(2);
    expect(candles[0]).toEqual({ time: 0, open: 50, high: 55, low: 48, close: 53 });
    expect(candles[1]).toEqual({ time: 60, open: 53, high: 58, low: 52, close: 57 });
  });
});

describe('updateCandlesWithTick', () => {
  it('met à jour la bougie courante si le tick est dans le même intervalle', () => {
    const initialCandles = [
      { time: 0, open: 100, high: 102, low: 99, close: 101 },
    ];
    const tick = { t: 3, price: 106 }; // high dépasse 102
    const updated = updateCandlesWithTick(initialCandles, tick, 5);

    expect(updated).toHaveLength(1);
    expect(updated[0]).toEqual({
      time: 0,
      open: 100,
      high: 106,
      low: 99,
      close: 106,
    });
  });

  it('crée une nouvelle bougie quand un nouveau créneau démarre', () => {
    const initialCandles = [
      { time: 0, open: 100, high: 102, low: 99, close: 101 },
    ];
    const tick = { t: 5, price: 103 }; // bucket 5
    const updated = updateCandlesWithTick(initialCandles, tick, 5);

    expect(updated).toHaveLength(2);
    expect(updated[0]).toEqual({ time: 0, open: 100, high: 102, low: 99, close: 101 });
    expect(updated[1]).toEqual({ time: 5, open: 103, high: 103, low: 103, close: 103 });
  });

  it('initialise la liste si elle était vide', () => {
    const tick = { t: 12, price: 250 };
    const candles = updateCandlesWithTick([], tick, 10);

    expect(candles).toHaveLength(1);
    expect(candles[0]).toEqual({
      time: 10,
      open: 250,
      high: 250,
      low: 250,
      close: 250,
    });
  });
});
