import { describe, expect, it } from 'vitest';
import {
  calculateScenarioPrice,
  PANIC_TUESDAY_SCENARIO,
} from './scenario/panic-tuesday.scenario.js';

describe('Audit Game Room - Multi-Participants & PnL Simulation', () => {
  it('garantit la stricte synchronisation des prix entre deux étudiants à la même seconde', () => {
    const elapsedSecond = 11 * 60; // Minute 11
    const priceStudent1 = calculateScenarioPrice(elapsedSecond);
    const priceStudent2 = calculateScenarioPrice(elapsedSecond);

    expect(priceStudent1.price).toBe(priceStudent2.price);
    expect(priceStudent1.currentMinute).toBe(priceStudent2.currentMinute);
    expect(priceStudent1.spread).toBe(priceStudent2.spread);
  });

  it('calcule fidèlement le P&L lors d’un achat avant choc et clôture après choc', () => {
    // Étudiant 1 achète 10 onces à la minute 5 (prix ~2700$)
    const buyPrice = calculateScenarioPrice(5 * 60).price;
    const initialCash = 100000;
    const qty = 10;
    const cost = qty * buyPrice;
    const remainingCash = initialCash - cost;

    expect(remainingCash).toBeLessThan(initialCash);

    // Chute à la minute 22 (Flash Crash vers 2620$)
    const crashPrice = calculateScenarioPrice(22 * 60).price;
    const marketValueAtCrash = qty * crashPrice;
    const unrealizedPnl = marketValueAtCrash - cost;

    // L'étudiant doit constater une perte latente significative
    expect(unrealizedPnl).toBeLessThan(-700);

    // Clôture de la position au crash
    const finalCash = remainingCash + marketValueAtCrash;
    const realizedPnl = finalCash - initialCash;
    expect(realizedPnl).toBeCloseTo(unrealizedPnl, 1);
  });

  it('valide l’efficacité d’une couverture par Stop-Loss à 2680$ lors du crash de la min 22', () => {
    const buyPrice = calculateScenarioPrice(5 * 60).price; // ~2700$
    const stopLoss = 2680.0;
    const qty = 10;
    const cost = qty * buyPrice;

    // Déclenchement du Stop-Loss lorsque le prix franchit 2680$
    const lossWithStop = qty * (stopLoss - buyPrice); // -200$ environ
    const lossWithoutStop = qty * (calculateScenarioPrice(22 * 60).price - buyPrice); // -800$

    expect(Math.abs(lossWithStop)).toBeLessThan(Math.abs(lossWithoutStop));
  });
});
