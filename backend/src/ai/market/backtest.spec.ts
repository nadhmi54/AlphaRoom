import { describe, expect, it } from 'vitest';
import { backtestSignal, describeBacktest, observe, WARMUP } from './backtest.js';
import { historyOf, trending } from './test-data.js';

/** Hausse régulière avec de petites oscillations. */
const wavyUp = (n: number) => trending(n, 100, 0.004).map((p, i) => p * (1 + 0.01 * Math.sin(i / 2)));

describe('backtest du signal', () => {
  it('trop peu d’historique : pas de résultat', () => {
    expect(backtestSignal(historyOf('XAU/USD', trending(WARMUP + 3, 100, 0.002)), 5)).toBeNull();
  });

  it('une hausse régulière donne des signaux haussiers qui ont réussi', () => {
    const result = backtestSignal(historyOf('XAU/USD', wavyUp(130)), 5)!;
    expect(result.tested).toBe(130 - WARMUP - 5);
    expect(result.bullish.observations).toBeGreaterThan(30);
    expect(result.bullish.taux_de_reussite_pct).toBeGreaterThan(80);
    expect(result.bullish.rendement_moyen_pct).toBeGreaterThan(0);
    expect(result.bearish.observations).toBe(0);
    expect(result.currentBias).toBe('haussier');
  });

  it('une baisse régulière donne des signaux baissiers « réussis » quand le prix baisse ensuite', () => {
    const closes = trending(130, 100, -0.004).map((p, i) => p * (1 + 0.01 * Math.sin(i / 2)));
    const result = backtestSignal(historyOf('XAU/USD', closes), 5)!;
    expect(result.bearish.observations).toBeGreaterThan(30);
    expect(result.bearish.taux_de_reussite_pct).toBeGreaterThan(80);
    expect(result.bearish.rendement_moyen_pct).toBeLessThan(0);
    expect(result.edgeBearish!).toBeGreaterThanOrEqual(0);
  });

  it('n’utilise jamais le futur : changer la suite ne modifie pas les signaux déjà calculés', () => {
    const closes = wavyUp(130);
    const altered = [...closes.slice(0, 100), ...closes.slice(100).map((p) => p * 0.5)]; // krach après le jour 100
    const a = observe(historyOf('XAU/USD', closes), 5);
    const b = observe(historyOf('XAU/USD', altered), 5);
    // Jusqu'au jour 100 - 5, le résultat final dépend des bougies jusqu'à i+5 ; les biais, eux, jamais du futur.
    const days = 100 - WARMUP - 5;
    expect(b.slice(0, days).map((o) => o.bias)).toEqual(a.slice(0, days).map((o) => o.bias));
    expect(b.slice(0, days).map((o) => o.forward)).toEqual(a.slice(0, days).map((o) => o.forward));
  });

  it('signale la fiabilité limitée et les limites de la méthode', () => {
    const out = describeBacktest(backtestSignal(historyOf('XAU/USD', wavyUp(80)), 5)!);
    expect(out.signal_haussier.fiabilite).toMatch(/faible|moyenne/);
    expect(out.limites).toContain('chevauchent');
    expect(out.reference_tous_les_jours.observations).toBeGreaterThan(0);
  });

  it('nomme les pourcentages avec _pct', () => {
    const out = describeBacktest(backtestSignal(historyOf('XAU/USD', wavyUp(130)), 5)!) as Record<string, unknown>;
    expect(Object.keys(out.signal_haussier as object)).toEqual(expect.arrayContaining(['taux_de_reussite_pct', 'rendement_moyen_pct', 'pire_cas_pct']));
  });
});
