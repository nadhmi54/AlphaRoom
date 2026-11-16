import { round } from '../contract/equity.js';
import { findMarketAsset, roundAssetPrice, type AssetCategory } from '../../portefeuille/trading/market-assets.js';
import type { AssetHistory } from './history.js';
import { CRYPTO_DAYS, TRADING_DAYS, annualVolatility, atr, levels, maxDrawdown, periodReturn, riskAdjusted, rsi, sma } from './indicators.js';

/**
 * Lecture d'un actif et classement des marchés. Tout est calculé ici, à partir de bougies
 * réelles : le modèle de langage ne fait que commenter ces résultats.
 * Rien de tout cela n'est une prévision : ce sont des faits sur le passé et des règles simples.
 */

export const HORIZONS = ['semaine', 'mois', 'trimestre'] as const;
export type Horizon = (typeof HORIZONS)[number];
export const CRITERIA = ['rendement', 'ajuste_au_risque'] as const;
export type Criterion = (typeof CRITERIA)[number];

export const RSI_OVERBOUGHT = 70;
export const RSI_OVERSOLD = 30;

export const MARKET_LABELS: Record<AssetCategory, string> = {
  crypto: 'crypto',
  stock: 'actions',
  commodity: 'matières premières',
  forex: 'devises',
};

export const DISCLAIMER =
  'Données réelles passées et règles simples : ce ne sont pas des prévisions. Les marchés réels sont indépendants de la séance simulée de la salle.';

/** Nombre de bougies pour un horizon : la crypto cote 7 jours sur 7, les autres marchés environ 5 sur 7. */
export function horizonCandles(horizon: Horizon, category: AssetCategory): number {
  const crypto = category === 'crypto';
  if (horizon === 'semaine') return crypto ? 7 : 5;
  if (horizon === 'mois') return crypto ? 30 : 21;
  return crypto ? 90 : 63;
}

const pct = (fraction: number) => round(fraction * 100, 2);
const periodsPerYear = (category: AssetCategory) => (category === 'crypto' ? CRYPTO_DAYS : TRADING_DAYS);

export type Trend = 'haussière' | 'baissière' | 'neutre';

export interface AssetAnalysis {
  symbol: string;
  name: string;
  category: AssetCategory;
  price: number;
  asOf: string;
  source: AssetHistory['source'];
  proxy: boolean;
  candles: number;
  returnFraction: number;
  volatilityFraction: number;
  ratio: number | null;
  drawdownFraction: number;
  rsi: number | null;
  trend: Trend;
  sma20: number | null;
  sma50: number | null;
  atr: number | null;
  support: number | null;
  resistance: number | null;
}

/** Métriques d'un actif sur l'horizon demandé (null si l'historique est trop court pour cet horizon). */
export function analyzeHistory(history: AssetHistory, horizon: Horizon): AssetAnalysis | null {
  const closes = history.candles.map((c) => c.close);
  const days = horizonCandles(horizon, history.category);
  const ret = periodReturn(closes, days);
  if (ret === null) return null;
  const window = closes.slice(-(days + 1));
  const ppy = periodsPerYear(history.category);
  const price = closes[closes.length - 1]!;
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  let trend: Trend = 'neutre';
  if (sma20 !== null) {
    if (sma50 !== null) {
      if (price > sma20 && sma20 > sma50) trend = 'haussière';
      else if (price < sma20 && sma20 < sma50) trend = 'baissière';
    } else if (price > sma20) trend = 'haussière';
    else if (price < sma20) trend = 'baissière';
  }
  const lv = levels(history.candles, 20);
  return {
    symbol: history.symbol,
    name: findMarketAsset(history.symbol)?.name ?? history.symbol,
    category: history.category,
    price: roundAssetPrice(history.symbol, price),
    asOf: history.candles[history.candles.length - 1]!.t,
    source: history.source,
    proxy: history.proxy,
    candles: history.candles.length,
    returnFraction: ret,
    volatilityFraction: annualVolatility(window, ppy),
    ratio: riskAdjusted(window, ppy),
    drawdownFraction: maxDrawdown(window),
    rsi: rsi(closes, 14),
    trend,
    sma20,
    sma50,
    atr: atr(history.candles, 14),
    support: lv?.support ?? null,
    resistance: lv?.resistance ?? null,
  };
}

const rounded = (value: number | null, digits = 2) => (value === null ? null : round(value, digits));

/** Ligne de classement (tous les nombres en pourcentage portent le suffixe `_pct`). */
export function summaryRow(a: AssetAnalysis, rank?: number) {
  return {
    ...(rank !== undefined ? { rang: rank } : {}),
    actif: a.symbol,
    nom: a.name,
    marche: MARKET_LABELS[a.category],
    prix: a.price,
    rendement_pct: pct(a.returnFraction),
    volatilite_annuelle_pct: pct(a.volatilityFraction),
    ratio_rendement_risque: rounded(a.ratio),
    baisse_maximale_pct: pct(a.drawdownFraction),
    rsi: rounded(a.rsi, 1),
    tendance: a.trend,
  };
}

const score = (a: AssetAnalysis, criterion: Criterion) => (criterion === 'ajuste_au_risque' ? (a.ratio ?? -Infinity) : a.returnFraction);

export function rankAssets(analyses: AssetAnalysis[], criterion: Criterion): AssetAnalysis[] {
  return [...analyses].sort((a, b) => score(b, criterion) - score(a, criterion));
}

/** Comparaison des marchés entre eux : moyenne par marché, classés selon le critère. */
export function rankMarkets(analyses: AssetAnalysis[], criterion: Criterion) {
  const byMarket = new Map<AssetCategory, AssetAnalysis[]>();
  for (const a of analyses) byMarket.set(a.category, [...(byMarket.get(a.category) ?? []), a]);
  const rows = [...byMarket.entries()].map(([category, items]) => {
    const avg = (pick: (a: AssetAnalysis) => number) => items.reduce((sum, a) => sum + pick(a), 0) / items.length;
    const ratios = items.map((a) => a.ratio).filter((r): r is number => r !== null);
    const best = rankAssets(items, criterion)[0]!;
    return {
      marche: MARKET_LABELS[category],
      nombre_actifs: items.length,
      rendement_moyen_pct: pct(avg((a) => a.returnFraction)),
      volatilite_moyenne_pct: pct(avg((a) => a.volatilityFraction)),
      ratio_moyen: ratios.length > 0 ? round(ratios.reduce((s, r) => s + r, 0) / ratios.length, 2) : null,
      part_actifs_en_hausse_pct: pct(items.filter((a) => a.returnFraction > 0).length / items.length),
      meilleur_actif: best.symbol,
      _sort: criterion === 'ajuste_au_risque' ? (ratios.length > 0 ? ratios.reduce((s, r) => s + r, 0) / ratios.length : -Infinity) : avg((a) => a.returnFraction),
    };
  });
  return rows
    .sort((a, b) => b._sort - a._sort)
    .map(({ _sort: _ignored, ...row }, index) => ({ rang: index + 1, ...row }));
}

export type Bias = 'haussier' | 'baissier' | 'neutre';
export type Caution = 'surachat' | 'survente' | null;

/**
 * Lecture « règles simples ». Le biais vient de trois signaux (tendance, élan sur le mois, cassure
 * d'un niveau) : score de −3 à +3, ce n'est pas une probabilité de gain. Le RSI ne change pas le biais :
 * il sert d'avertissement (`caution`) sur le MOMENT d'entrer, un actif très haussier étant souvent suracheté.
 */
export function readAsset(a: AssetAnalysis, monthReturn: number | null) {
  const reasons: string[] = [];
  let points = 0;
  if (a.trend === 'haussière') {
    points += 1;
    reasons.push('Tendance haussière : le prix est au-dessus de ses moyennes mobiles.');
  } else if (a.trend === 'baissière') {
    points -= 1;
    reasons.push('Tendance baissière : le prix est sous ses moyennes mobiles.');
  } else reasons.push('Tendance indécise : le prix navigue autour de ses moyennes mobiles.');

  if (monthReturn !== null && Math.abs(monthReturn) > 0.01) {
    points += monthReturn > 0 ? 1 : -1;
    reasons.push(monthReturn > 0 ? 'Élan positif sur le dernier mois.' : 'Élan négatif sur le dernier mois.');
  }
  if (a.resistance !== null && a.support !== null) {
    if (a.price >= a.resistance * 0.995) {
      points += 1;
      reasons.push('Le prix est sur ses plus hauts récents (cassure de la résistance) : à confirmer, une cassure peut être un faux signal.');
    } else if (a.price <= a.support * 1.005) {
      points -= 1;
      reasons.push('Le prix est sur ses plus bas récents (cassure du support).');
    }
  }
  let caution: Caution = null;
  if (a.rsi !== null && a.rsi >= RSI_OVERBOUGHT) {
    caution = 'surachat';
    reasons.push('RSI en zone de surachat : après une forte hausse, un repli est plus probable. Signal de prudence sur le moment d’acheter, pas un ordre de vendre.');
  } else if (a.rsi !== null && a.rsi <= RSI_OVERSOLD) {
    caution = 'survente';
    reasons.push('RSI en zone de survente : après une forte baisse, un rebond technique est possible, mais un actif survendu peut continuer à baisser.');
  }
  const bias: Bias = points >= 2 ? 'haussier' : points <= -2 ? 'baissier' : 'neutre';
  return { bias, points, reasons, caution };
}

/**
 * Niveaux « école » à partir de la volatilité réelle (ATR) : stop à 2 ATR sous le prix, objectif à
 * 3 ATR au-dessus (rapport gain/risque 1,5). Ce sont des repères pédagogiques à valider avec la taille
 * de position, pas des ordres.
 */
export function suggestLevels(a: AssetAnalysis) {
  if (a.atr === null || a.atr <= 0) return null;
  const stop = roundAssetPrice(a.symbol, Math.max(a.price - 2 * a.atr, 0.000001));
  const target = roundAssetPrice(a.symbol, a.price + 3 * a.atr);
  return {
    stop_suggere: stop,
    objectif_suggere: target,
    perte_si_stop_pct: pct((stop - a.price) / a.price),
    gain_si_objectif_pct: pct((target - a.price) / a.price),
    amplitude_journaliere_moyenne: roundAssetPrice(a.symbol, a.atr),
    amplitude_journaliere_moyenne_pct: pct(a.atr / a.price),
  };
}
