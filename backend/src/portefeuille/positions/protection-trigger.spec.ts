import { describe, expect, it } from 'vitest';
import { getProtectionTrigger } from './protection-trigger.js';

describe('getProtectionTrigger', () => {
  it('déclenche le stop-loss lorsque le cours atteint ou passe sous le seuil', () => {
    expect(getProtectionTrigger(90, { stopLoss: 90, takeProfit: 120 })).toBe('stop_loss');
    expect(getProtectionTrigger(89, { stopLoss: 90, takeProfit: null })).toBe('stop_loss');
  });

  it('déclenche le take-profit lorsque le cours atteint ou dépasse le seuil', () => {
    expect(getProtectionTrigger(120, { stopLoss: null, takeProfit: 120 })).toBe('take_profit');
    expect(getProtectionTrigger(121, { stopLoss: null, takeProfit: 120 })).toBe('take_profit');
  });

  it('ne déclenche rien entre les seuils ou pour un prix invalide', () => {
    expect(getProtectionTrigger(100, { stopLoss: 90, takeProfit: 120 })).toBeNull();
    expect(getProtectionTrigger(0, { stopLoss: 90, takeProfit: 120 })).toBeNull();
    expect(getProtectionTrigger(Number.NaN, { stopLoss: null, takeProfit: 120 })).toBeNull();
  });
});
