import { describe, expect, it } from 'vitest';
import { annualVolatility, atr, dailyReturns, levels, maxDrawdown, mean, periodReturn, riskAdjusted, rsi, sma, stdDev } from './indicators.js';
import { candlesFrom, trending } from './test-data.js';

describe('indicateurs de marché', () => {
  it('moyenne mobile et rendements', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toBe(4);
    expect(sma([1, 2], 3)).toBeNull();
    expect(dailyReturns([100, 110, 99])).toEqual([expect.closeTo(0.1, 10), expect.closeTo(-0.1, 10)]);
    expect(periodReturn([100, 105, 110, 121], 3)).toBeCloseTo(0.21, 10);
    expect(periodReturn([100, 105], 5)).toBeNull();
  });

  it('écart-type et moyenne', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(stdDev([5])).toBe(0);
  });

  it('volatilité annualisée : nulle sans variation, croissante avec les secousses', () => {
    const flat = Array(30).fill(100) as number[];
    const calm = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 0.1 : -0.1));
    const wild = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 5 : -5));
    expect(annualVolatility(flat, 252)).toBe(0);
    expect(annualVolatility(wild, 252)).toBeGreaterThan(annualVolatility(calm, 252));
  });

  it('rendement ajusté au risque : positif en tendance régulière, nul si le prix est plat', () => {
    expect(riskAdjusted(Array(30).fill(100) as number[], 252)).toBeNull();
    const noisy = trending(40, 100, 0.002).map((v, i) => v * (1 + (i % 2 === 0 ? 0.004 : -0.004)));
    expect(riskAdjusted(noisy, 252)!).toBeGreaterThan(0);
  });

  it('pire baisse depuis un sommet', () => {
    expect(maxDrawdown([100, 120, 90, 110])).toBeCloseTo(-0.25, 10);
    expect(maxDrawdown([100, 110, 120])).toBe(0);
  });

  it('RSI : 100 en hausse continue, 0 en baisse continue, 50 si plat, entre 0 et 100 sinon', () => {
    expect(rsi(trending(30, 100, 0.01))).toBe(100);
    expect(rsi(trending(30, 100, -0.01))!).toBeCloseTo(0, 5);
    expect(rsi(Array(30).fill(100) as number[])).toBe(50);
    expect(rsi([1, 2, 3])).toBeNull();
    const mixed = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 2) * 5);
    const value = rsi(mixed)!;
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(100);
  });

  it('ATR : amplitude journalière moyenne ; supports et résistances sur 20 jours', () => {
    const candles = candlesFrom(Array(30).fill(100) as number[]);
    expect(atr(candles)).toBeCloseTo(2, 6); // mèches de ±1 % : 2 par jour
    expect(atr(candles.slice(0, 5))).toBeNull();
    const lv = levels(candlesFrom([100, 102, 101, 105, 103]), 20)!;
    expect(lv.support).toBeCloseTo(99, 6);
    expect(lv.resistance).toBeCloseTo(105 * 1.01, 6);
    expect(levels([])).toBeNull();
  });
});
