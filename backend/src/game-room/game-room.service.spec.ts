import { describe, expect, it } from 'vitest';
import {
  calculateScenarioPrice,
  PANIC_TUESDAY_SCENARIO,
} from './scenario/panic-tuesday.scenario.js';

describe('Game Room - Scenario Panic Tuesday Engine', () => {
  it('définit correctement les paramètres de base du scénario', () => {
    expect(PANIC_TUESDAY_SCENARIO.name).toBe('Le mardi de la panique');
    expect(PANIC_TUESDAY_SCENARIO.symbol).toBe('XAU/USD');
    expect(PANIC_TUESDAY_SCENARIO.durationMinutes).toBe(30);
    expect(PANIC_TUESDAY_SCENARIO.initialPrice).toBe(2700);
    expect(PANIC_TUESDAY_SCENARIO.initialCash).toBe(100000);
  });

  it('fournit un prix initial proche de 2700 à la minute 0', () => {
    const res = calculateScenarioPrice(0);
    expect(res.currentMinute).toBe(0);
    expect(res.price).toBeGreaterThan(2699);
    expect(res.price).toBeLessThan(2701);
  });

  it('reflète la baisse vers 2693 à la minute 11', () => {
    const res = calculateScenarioPrice(11 * 60);
    expect(res.currentMinute).toBe(11);
    expect(res.price).toBeGreaterThan(2691);
    expect(res.price).toBeLessThan(2695);
  });

  it('reflète le flash crash vers 2620 à la minute 22 avec élargissement du spread', () => {
    const res = calculateScenarioPrice(22 * 60);
    expect(res.currentMinute).toBe(22);
    expect(res.price).toBeGreaterThan(2615);
    expect(res.price).toBeLessThan(2625);
    expect(res.spread).toBeGreaterThanOrEqual(0.8); // spread élargi
  });

  it('reflète le rebond vers 2640 à la minute 25', () => {
    const res = calculateScenarioPrice(25 * 60);
    expect(res.currentMinute).toBe(25);
    expect(res.price).toBeGreaterThan(2638);
    expect(res.price).toBeLessThan(2643);
  });

  it('applique correctement un choc manuel sur le prix', () => {
    const normal = calculateScenarioPrice(10 * 60);
    const shocked = calculateScenarioPrice(10 * 60, -50);
    expect(shocked.price).toBeCloseTo(normal.price - 50, 0);
  });
});
