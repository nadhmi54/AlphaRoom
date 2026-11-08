import type { AssetHistory } from './history.js';
import type { Candle } from './indicators.js';

/** Bougies synthétiques pour les tests : close(i) donné, mèches de ±1 %. */
export function candlesFrom(closes: number[], start = '2026-06-01'): Candle[] {
  const base = Date.parse(`${start}T00:00:00Z`);
  return closes.map((close, i) => ({
    t: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
  }));
}

export const trending = (n: number, from: number, dailyGrowth: number) => Array.from({ length: n }, (_, i) => from * (1 + dailyGrowth) ** i);

export function historyOf(symbol: string, closes: number[], category: AssetHistory['category'] = 'commodity', extra: Partial<AssetHistory> = {}): AssetHistory {
  return { symbol, category, candles: candlesFrom(closes), source: 'yahoo', providerSymbol: symbol, proxy: false, ...extra };
}
