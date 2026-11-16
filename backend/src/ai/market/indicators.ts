/**
 * Indicateurs de marché calculés par le CODE (jamais par le modèle) sur des bougies
 * journalières. Fonctions pures : mêmes entrées, mêmes sorties, testables sans réseau.
 */

export interface Candle {
  /** Jour de la bougie (ISO 8601, ex. « 2026-11-03 »). */
  t: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export const TRADING_DAYS = 252;
export const CRYPTO_DAYS = 365;

export const mean = (values: number[]): number => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
}

/** Moyenne mobile simple des `period` derniers points (null si pas assez de données). */
export function sma(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  return mean(values.slice(-period));
}

/** Rendements simples d'un jour à l'autre (fractions : 0,01 = +1 %). */
export function dailyReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const previous = closes[i - 1]!;
    if (previous > 0) out.push(closes[i]! / previous - 1);
  }
  return out;
}

/** Rendement sur les `days` derniers jours de bourse (fraction), null si l'historique est trop court. */
export function periodReturn(closes: number[], days: number): number | null {
  if (days <= 0 || closes.length <= days) return null;
  const start = closes[closes.length - 1 - days]!;
  return start > 0 ? closes[closes.length - 1]! / start - 1 : null;
}

/** Volatilité annualisée (écart-type des rendements journaliers × √jours par an). */
export function annualVolatility(closes: number[], periodsPerYear: number): number {
  return stdDev(dailyReturns(closes)) * Math.sqrt(periodsPerYear);
}

/**
 * Rendement ajusté au risque : rendement annualisé moyen / volatilité annualisée
 * (ratio de Sharpe sans taux sans risque, suffisant pour comparer des actifs entre eux).
 */
export function riskAdjusted(closes: number[], periodsPerYear: number): number | null {
  const returns = dailyReturns(closes);
  const vol = stdDev(returns) * Math.sqrt(periodsPerYear);
  if (returns.length < 5 || vol < 1e-9) return null;
  return (mean(returns) * periodsPerYear) / vol;
}

/** Pire baisse depuis un sommet (fraction négative, ex. −0,12 = −12 %). */
export function maxDrawdown(closes: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const close of closes) {
    peak = Math.max(peak, close);
    if (peak > 0) worst = Math.min(worst, close / peak - 1);
  }
  return worst;
}

/** RSI de Wilder (0–100). null si moins de `period + 1` points. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = closes[i]! - closes[i - 1]!;
    if (change >= 0) gain += change;
    else loss -= change;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** Average True Range : amplitude moyenne d'une journée, en unités de prix (base des stops). */
export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const ranges: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const c = candles[i]!;
    const previousClose = candles[i - 1]!.close;
    ranges.push(Math.max(c.high - c.low, Math.abs(c.high - previousClose), Math.abs(c.low - previousClose)));
  }
  let value = mean(ranges.slice(0, period));
  for (let i = period; i < ranges.length; i += 1) value = (value * (period - 1) + ranges[i]!) / period;
  return value;
}

/** Plus bas et plus haut des `period` dernières bougies : supports et résistances « simples ». */
export function levels(candles: Candle[], period = 20): { support: number; resistance: number } | null {
  if (candles.length < 2) return null;
  const window = candles.slice(-period);
  return { support: Math.min(...window.map((c) => c.low)), resistance: Math.max(...window.map((c) => c.high)) };
}
