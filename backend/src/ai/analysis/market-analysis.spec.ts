import { describe, expect, it } from 'vitest';
import { buildPanicTuesday } from '../fixtures/panic-tuesday.js';
import { analyzeMarket } from './market-analysis.js';

const analysis = analyzeMarket(buildPanicTuesday());

describe('analyse du marché (calculs vérifiés à la main)', () => {
  it('résume le prix de XAU/USD', () => {
    const [xau] = analysis.symbols;
    expect(xau).toMatchObject({ symbol: 'XAU/USD', first: 2700, last: 2640, min: 2619, minMinute: 22, max: 2700, maxMinute: 0 });
    expect(xau!.changeRate).toBeCloseTo(-60 / 2700, 5);
  });

  it('trouve la plus forte variation en une minute : le choc de la minute 22', () => {
    // (2619 − 2680) / 2680
    expect(analysis.symbols[0]!.biggestMove).toEqual({ minute: 22, rate: -0.022761 });
  });

  it('volatilité = écart-type des variations d’une minute (recalculé ici)', () => {
    const prices = buildPanicTuesday().prices.map((p) => p.price);
    const returns = prices.slice(1).map((p, i) => (p - prices[i]!) / prices[i]!);
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const expected = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length);
    expect(analysis.symbols[0]!.volatility).toBeCloseTo(expected, 5);
    expect(expected).toBeGreaterThan(0);
  });

  it('ne garde que les événements qui bousculent le marché (pas la pause)', () => {
    expect(analysis.events.map((e) => e.id)).toEqual(['ev-news', 'ev-shock']);
  });

  it('mesure l’effet de la NEWS : prix à la minute 10 vs minute 16', () => {
    const news = analysis.events[0]!;
    expect(news.impacts).toEqual([{ symbol: 'XAU/USD', before: 2700, after: 2680, moveRate: -0.007407 }]);
  });

  it('mesure l’effet du choc : prix à la minute 21 vs minute 27', () => {
    const shock = analysis.events[1]!;
    expect(shock.impacts[0]).toEqual({ symbol: 'XAU/USD', before: 2680, after: 2640, moveRate: -0.014925 });
  });

  it('compte les participants qui ont réagi dans les 10 minutes', () => {
    // NEWS (min 11) : Karim (12) et Sarra (13). Choc (min 22) : Karim (24, 27).
    expect(analysis.events[0]).toMatchObject({ participants: 4, reacted: 2 });
    expect(analysis.events[1]).toMatchObject({ participants: 4, reacted: 1 });
  });

  it('écrit des constats lisibles avec leurs preuves', () => {
    const texts = analysis.highlights.map((h) => h.text);
    expect(texts[0]).toContain('de 2 700 à 2 640 (−2,2 %)');
    expect(texts.some((t) => t.includes('Minute 11') && t.includes('2 participants sur 4'))).toBe(true);
    expect(analysis.highlights.every((h) => h.evidence.length > 0)).toBe(true);
  });

  it('une séance sans prix donne une analyse vide sans planter', () => {
    const empty = analyzeMarket({ ...buildPanicTuesday(), prices: [], events: [] });
    expect(empty.symbols).toEqual([]);
    expect(empty.highlights).toEqual([]);
  });
});
