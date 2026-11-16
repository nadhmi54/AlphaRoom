import { describe, expect, it } from 'vitest';
import { pct, price, signedPct } from './format.js';

describe('formats d’affichage', () => {
  it('une petite variation garde deux décimales au lieu de « 0 % »', () => {
    expect(signedPct(-0.000096)).toBe('−0,01 %');
    expect(signedPct(-0.0000001)).toBe('0 %');
    expect(signedPct(-0.0096)).toBe('−0,96 %');
    expect(pct(0.0004)).toBe('0,04 %');
  });

  it('les variations courantes gardent une décimale', () => {
    expect(signedPct(0.055)).toBe('+5,5 %');
    expect(signedPct(0)).toBe('0 %');
  });

  it('les prix ont des espaces pour les milliers', () => {
    expect(price(2700.22)).toBe('2 700,22');
  });
});
