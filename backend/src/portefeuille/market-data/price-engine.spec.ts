import { describe, expect, it } from 'vitest';
import { FEED_SPECS, LIVE_STALE_MS } from './market-feed-config.js';
import { PriceBook } from './price-book.js';
import { gaussian, simulateStep } from './price-simulator.js';

/** Générateur déterministe (LCG) pour des tests reproductibles. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const initial = new Map([
  ['XAU/USD', 2685.4],
  ['EUR/USD', 1.0834],
  ['BTC/USD', 67500],
  ['AAPL', 224.5],
]);

describe('simulateStep', () => {
  it('garde un prix strictement positif sur de très longues séries', () => {
    const random = seeded(7);
    let price = 67500;
    for (let i = 0; i < 20000; i += 1) {
      price = simulateStep(price, 67500, 0.55, 1, random);
      expect(price).toBeGreaterThan(0);
    }
  });

  it('ne bouge pas à volatilité nulle et ancre égale', () => {
    expect(simulateStep(100, 100, 0, 1, () => 0.5)).toBeCloseTo(100, 10);
  });

  it('rappelle le prix vers le dernier prix réel', () => {
    // Choc nul (u = e^-0.5 donne cos(2πv) avec v = 0.25 → Z = 0).
    const noShock = (() => {
      const values = [Math.exp(-0.5), 0.25];
      let i = 0;
      return () => values[i++ % 2];
    })();
    const next = simulateStep(110, 100, 0.0001, 1, noShock);
    expect(next).toBeLessThan(110);
    expect(next).toBeGreaterThan(100);
  });

  it('produit des chocs de moyenne ~0 et d\'écart-type ~1', () => {
    const random = seeded(42);
    const values = Array.from({ length: 20000 }, () => gaussian(random));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.sqrt(variance)).toBeGreaterThan(0.95);
    expect(Math.sqrt(variance)).toBeLessThan(1.05);
  });
});

describe('PriceBook', () => {
  it('démarre en simulation tant qu\'aucun prix réel n\'est arrivé', () => {
    const book = new PriceBook(FEED_SPECS, initial, seeded(1));
    const states = book.step(1_000, 1);
    expect(states).toHaveLength(4);
    expect(states.every((s) => s.source === 'simulated')).toBe(true);
  });

  it('suit le prix réel tant qu\'il est frais', () => {
    const book = new PriceBook(FEED_SPECS, initial, seeded(1));
    book.recordReal({ symbol: 'BTC/USD', price: 70123.45, at: 5_000 });
    const btc = book.step(6_000, 1).find((s) => s.symbol === 'BTC/USD');
    expect(btc).toMatchObject({ price: 70123.45, source: 'live' });
    // Les autres actifs restent en simulation.
    expect(book.get('AAPL')?.source).toBe('simulated');
  });

  it('bascule en simulation quand le flux se tait, puis revient en direct', () => {
    const book = new PriceBook(FEED_SPECS, initial, seeded(3));
    book.recordReal({ symbol: 'AAPL', price: 230, at: 0 });
    expect(book.step(1_000, 1).find((s) => s.symbol === 'AAPL')?.source).toBe('live');

    const stale = book.step(LIVE_STALE_MS + 1_000, 1).find((s) => s.symbol === 'AAPL');
    expect(stale?.source).toBe('simulated');
    // La simulation repart du dernier prix réel, pas du prix de démonstration.
    expect(Math.abs((stale?.price ?? 0) - 230)).toBeLessThan(1);

    book.recordReal({ symbol: 'AAPL', price: 231.5, at: LIVE_STALE_MS + 2_000 });
    expect(book.step(LIVE_STALE_MS + 3_000, 1).find((s) => s.symbol === 'AAPL')).toMatchObject({
      price: 231.5,
      source: 'live',
    });
  });

  it('ignore les prix invalides et les symboles inconnus', () => {
    const book = new PriceBook(FEED_SPECS, initial, seeded(1));
    book.recordReal({ symbol: 'BTC/USD', price: -5, at: 1 });
    book.recordReal({ symbol: 'NOPE', price: 10, at: 1 });
    expect(book.step(2_000, 1).find((s) => s.symbol === 'BTC/USD')?.source).toBe('simulated');
    expect(book.get('NOPE')).toBeUndefined();
  });
});
