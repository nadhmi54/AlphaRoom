import { describe, expect, it } from 'vitest';
import { HORIZONS, analyzeHistory, horizonCandles, rankAssets, rankMarkets, readAsset, suggestLevels, summaryRow } from './analysis.js';
import { historyOf, trending } from './test-data.js';

const up = historyOf('XAU/USD', trending(90, 2000, 0.004));
const down = historyOf('WTI/USD', trending(90, 90, -0.004));
const flat = historyOf('EUR/USD', Array.from({ length: 90 }, (_, i) => 1.08 + (i % 2 === 0 ? 0.001 : -0.001)), 'forex');
const crypto = historyOf('SOL/USDT', trending(120, 100, 0.01), 'crypto', { source: 'binance' });

describe('analyse d’un actif', () => {
  it('adapte l’horizon au marché (la crypto cote 7 jours sur 7)', () => {
    expect(horizonCandles('mois', 'crypto')).toBe(30);
    expect(horizonCandles('mois', 'stock')).toBe(21);
    expect(HORIZONS).toEqual(['semaine', 'mois', 'trimestre']);
  });

  it('calcule rendement, tendance et volatilité sur l’horizon', () => {
    const a = analyzeHistory(up, 'mois')!;
    expect(a.returnFraction).toBeCloseTo(1.004 ** 21 - 1, 6);
    expect(a.trend).toBe('haussière');
    expect(analyzeHistory(down, 'mois')!.trend).toBe('baissière');
    expect(analyzeHistory(flat, 'mois')!.trend).not.toBe('haussière');
    expect(analyzeHistory(historyOf('X', [1, 2, 3]), 'trimestre')).toBeNull();
  });

  it('renvoie des lignes dont les pourcentages portent le suffixe _pct', () => {
    const row = summaryRow(analyzeHistory(up, 'mois')!, 1);
    expect(row).toMatchObject({ rang: 1, actif: 'XAU/USD', marche: 'matières premières', tendance: 'haussière' });
    expect(row.rendement_pct).toBeCloseTo((1.004 ** 21 - 1) * 100, 1);
    expect(Object.keys(row).filter((k) => k.includes('pct'))).toEqual(['rendement_pct', 'volatilite_annuelle_pct', 'baisse_maximale_pct']);
  });

  it('classe selon le critère demandé', () => {
    const all = [up, down, flat, crypto].map((h) => analyzeHistory(h, 'mois')!);
    expect(rankAssets(all, 'rendement').map((a) => a.symbol)[0]).toBe('SOL/USDT'); // 1 %/jour
    expect(rankAssets(all, 'rendement').at(-1)!.symbol).toBe('WTI/USD');
  });

  it('compare les marchés entre eux', () => {
    const all = [up, down, flat, crypto].map((h) => analyzeHistory(h, 'mois')!);
    const markets = rankMarkets(all, 'rendement');
    expect(markets.map((m) => m.marche)).toEqual(['crypto', 'matières premières', 'devises']);
    expect(markets[0]).toMatchObject({ rang: 1, meilleur_actif: 'SOL/USDT', nombre_actifs: 1 });
    expect(markets[1]).toMatchObject({ nombre_actifs: 2, part_actifs_en_hausse_pct: 50 });
  });

  it('lit un actif : biais haussier en tendance haussière, baissier en tendance baissière, avec raisons', () => {
    const upRead = readAsset(analyzeHistory(up, 'mois')!, analyzeHistory(up, 'mois')!.returnFraction);
    expect(upRead.bias).toBe('haussier');
    expect(upRead.reasons.join(' ')).toContain('Tendance haussière');
    const downA = analyzeHistory(down, 'mois')!;
    expect(readAsset(downA, downA.returnFraction).bias).toBe('baissier');
    const flatA = analyzeHistory(flat, 'mois')!;
    expect(readAsset(flatA, flatA.returnFraction).bias).toBe('neutre');
  });

  it('signale le surachat comme une prudence sur le moment d’entrer, sans renverser le biais', () => {
    const a = analyzeHistory(crypto, 'mois')!;
    expect(a.rsi).toBe(100);
    const read = readAsset(a, a.returnFraction);
    expect(read.caution).toBe('surachat');
    expect(read.bias).toBe('haussier');
    expect(read.reasons.join(' ')).toContain('surachat');
    const sold = analyzeHistory(down, 'mois')!;
    expect(readAsset(sold, sold.returnFraction)).toMatchObject({ bias: 'baissier', caution: 'survente' });
  });

  it('propose un stop et un objectif fondés sur la volatilité réelle', () => {
    const a = analyzeHistory(up, 'mois')!;
    const levels = suggestLevels(a)!;
    expect(levels.stop_suggere).toBeLessThan(a.price);
    expect(levels.objectif_suggere).toBeGreaterThan(a.price);
    expect(levels.perte_si_stop_pct).toBeLessThan(0);
    expect(levels.gain_si_objectif_pct).toBeGreaterThan(Math.abs(levels.perte_si_stop_pct));
  });
});
