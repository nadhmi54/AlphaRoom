import { describe, expect, it } from 'vitest';
import { buildEquityCurve, priceAt } from './equity.js';

const prices = [
  { minute: 0, symbol: 'X', price: 10 },
  { minute: 5, symbol: 'X', price: 12 },
];

describe('priceAt', () => {
  it('renvoie le dernier prix connu', () => {
    expect(priceAt(prices, 'X', 3)).toBe(10);
    expect(priceAt(prices, 'X', 5)).toBe(12);
    expect(priceAt(prices, 'X', 99)).toBe(12);
  });
  it('retombe sur la valeur de repli quand rien n’est connu', () => {
    expect(priceAt(prices, 'Y', 3, 7)).toBe(7);
    expect(priceAt(prices, 'Y', 3)).toBeUndefined();
  });
});

describe('buildEquityCurve', () => {
  it('conserve la valeur totale à l’achat puis suit le prix', () => {
    const curve = buildEquityCurve(1000, [{ id: '1', minute: 2, symbol: 'X', side: 'buy', quantity: 10, price: 10 }], prices, 6);
    expect(curve).toHaveLength(7);
    expect(curve[1]).toEqual({ minute: 1, cash: 1000, positionsValue: 0 });
    expect(curve[2]).toEqual({ minute: 2, cash: 900, positionsValue: 100 });
    expect(curve[5]).toEqual({ minute: 5, cash: 900, positionsValue: 120 });
  });
  it('encaisse une vente et solde la position', () => {
    const curve = buildEquityCurve(
      1000,
      [
        { id: '1', minute: 1, symbol: 'X', side: 'buy', quantity: 10, price: 10 },
        { id: '2', minute: 5, symbol: 'X', side: 'sell', quantity: 10, price: 12 },
      ],
      prices,
      6,
    );
    expect(curve[6]).toEqual({ minute: 6, cash: 1020, positionsValue: 0 });
  });
});
