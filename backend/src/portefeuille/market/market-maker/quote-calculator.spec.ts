import { describe, it, expect } from 'vitest';
import { QuoteCalculator } from './quote-calculator.js';

describe('QuoteCalculator', () => {
  it('calcule un spread symétrique sans inventaire', () => {
    const quote = QuoteCalculator.calculate(100, 10, 0, 0, 1000);
    // 10 bps = 0.1% = 0.1 USD sur 100
    expect(quote.mid).toBe(100);
    expect(quote.bid).toBe(99.95);
    expect(quote.ask).toBe(100.05);
  });

  it('décale le prix (skew) avec l\'inventaire', () => {
    // Inventaire positif -> on veut vendre -> on baisse le prix
    const quote = QuoteCalculator.calculate(100, 10, 0, 500, 1000);
    expect(quote.mid).toBeLessThan(100);
    expect(quote.bid).toBeLessThan(99.95);
  });

  it('élargit le spread avec la volatilité', () => {
    const tight = QuoteCalculator.calculate(100, 10, 0, 0, 1000);
    const wide = QuoteCalculator.calculate(100, 10, 0.5, 0, 1000);
    expect(wide.ask - wide.bid).toBeGreaterThan(tight.ask - tight.bid);
  });
});
