import { normalizeSymbol } from '../trading/market-assets.js';

export type FeedProvider = 'binance' | 'finnhub' | 'yahoo';

export interface FeedSpec {
  /** Symbole interne de la simulation (celui de `market-assets.ts`). */
  symbol: string;
  provider: FeedProvider;
  /** Symbole chez le fournisseur (Binance : minuscules, Yahoo/Finnhub : tel quel). */
  providerSymbol: string;
  /** Volatilité annuelle utilisée par la simulation de repli. */
  annualVolatility: number;
}

/**
 * Où trouver le prix réel de chaque actif — source de vérité commune à
 * `/marche` et `/game-room`.
 *
 * - Binance (public, sans clé, 24 h/24) : crypto et deux proxys très liquides
 *   pour l'or et l'euro.
 * - Yahoo Finance Chart API (public, sans clé) : actions, matières premières
 *   et devises. Le flux est interrogé par polling ; un prix daté (marché fermé)
 *   reste un point d'ancrage réel mais le moteur le signale « simulé » dès qu'il
 *   n'est plus frais, pour ne jamais faire passer une simulation pour du live.
 * - Finnhub : prioritaire pour AAPL si `FINNHUB_API_KEY` est fourni ; sinon le
 *   même actif bascule automatiquement sur Yahoo.
 *
 * Aucun actif n'utilise plus `provider: 'none'` : chaque instrument du catalogue
 * possède un fournisseur réel, et la simulation n'est qu'un repli explicite.
 */
export const FEED_SPECS: readonly FeedSpec[] = [
  // ── Crypto + proxys or/euro (Binance) ─────────────────────────────────────
  { symbol: 'XAU/USD',     provider: 'binance',  providerSymbol: 'paxgusdt',  annualVolatility: 0.16 },
  { symbol: 'EUR/USD',     provider: 'binance',  providerSymbol: 'eurusdt',   annualVolatility: 0.08 },
  { symbol: 'BTC/USD',     provider: 'binance',  providerSymbol: 'btcusdt',   annualVolatility: 0.55 },
  { symbol: 'BTC/USDT',    provider: 'binance',  providerSymbol: 'btcusdt',   annualVolatility: 0.55 },
  { symbol: 'ETH/USDT',    provider: 'binance',  providerSymbol: 'ethusdt',   annualVolatility: 0.60 },
  { symbol: 'SOL/USDT',    provider: 'binance',  providerSymbol: 'solusdt',   annualVolatility: 0.75 },
  { symbol: 'BNB/USDT',    provider: 'binance',  providerSymbol: 'bnbusdt',   annualVolatility: 0.55 },
  { symbol: 'XRP/USDT',    provider: 'binance',  providerSymbol: 'xrpusdt',   annualVolatility: 0.70 },
  // ── Actions US (Yahoo, Finnhub pour AAPL si clé) ──────────────────────────
  { symbol: 'AAPL',        provider: 'finnhub',  providerSymbol: 'AAPL',      annualVolatility: 0.30 },
  { symbol: 'MSFT',        provider: 'yahoo',    providerSymbol: 'MSFT',      annualVolatility: 0.28 },
  { symbol: 'GOOGL',       provider: 'yahoo',    providerSymbol: 'GOOGL',     annualVolatility: 0.30 },
  { symbol: 'AMZN',        provider: 'yahoo',    providerSymbol: 'AMZN',      annualVolatility: 0.32 },
  { symbol: 'TSLA',        provider: 'yahoo',    providerSymbol: 'TSLA',      annualVolatility: 0.55 },
  { symbol: 'NVDA',        provider: 'yahoo',    providerSymbol: 'NVDA',      annualVolatility: 0.50 },
  { symbol: 'META',        provider: 'yahoo',    providerSymbol: 'META',      annualVolatility: 0.35 },
  // ── Matières premières (Yahoo, contrats à terme) ──────────────────────────
  { symbol: 'XAG/USD',     provider: 'yahoo',    providerSymbol: 'SI=F',      annualVolatility: 0.25 },
  { symbol: 'WTI/USD',     provider: 'yahoo',    providerSymbol: 'CL=F',      annualVolatility: 0.35 },
  { symbol: 'BRENT/USD',   provider: 'yahoo',    providerSymbol: 'BZ=F',      annualVolatility: 0.33 },
  { symbol: 'NATGAS/USD',  provider: 'yahoo',    providerSymbol: 'NG=F',      annualVolatility: 0.50 },
  { symbol: 'COPPER/USD',  provider: 'yahoo',    providerSymbol: 'HG=F',      annualVolatility: 0.22 },
  // ── Devises (Yahoo) ────────────────────────────────────────────────────────
  { symbol: 'GBP/USD',     provider: 'yahoo',    providerSymbol: 'GBPUSD=X',  annualVolatility: 0.09 },
  { symbol: 'USD/JPY',     provider: 'yahoo',    providerSymbol: 'JPY=X',     annualVolatility: 0.08 },
  { symbol: 'USD/CHF',     provider: 'yahoo',    providerSymbol: 'CHF=X',     annualVolatility: 0.08 },
  { symbol: 'AUD/USD',     provider: 'yahoo',    providerSymbol: 'AUDUSD=X',  annualVolatility: 0.10 },
  { symbol: 'USD/CAD',     provider: 'yahoo',    providerSymbol: 'CAD=X',     annualVolatility: 0.08 },
];

/** Clé de comparaison insensible aux séparateurs et à la casse. */
function engineKey(symbol: string): string {
  return normalizeSymbol(symbol).replace(/[^A-Z0-9]/g, '');
}

const ENGINE_SYMBOLS = new Map<string, string>(
  FEED_SPECS.map((spec) => [engineKey(spec.symbol), spec.symbol]),
);

/**
 * Symbole canonique du moteur (`btcusdt` → `BTC/USDT`), ou `null` si l'actif
 * n'est pas suivi par le PriceBook. Utilisé par les contrôleurs pour router
 * vers le même historique et la même cotation que `/game-room`.
 */
export function canonicalEngineSymbol(symbol: string): string | null {
  if (!symbol) return null;
  return ENGINE_SYMBOLS.get(engineKey(symbol)) ?? null;
}

export function isEngineSymbol(symbol: string): boolean {
  return canonicalEngineSymbol(symbol) !== null;
}

/** Tous les symboles du moteur, dans l'ordre du registre. */
export function engineSymbols(): readonly string[] {
  return FEED_SPECS.map((spec) => spec.symbol);
}

/** Sans prix réel depuis ce délai, l'actif bascule en simulation. */
export const LIVE_STALE_MS = 20_000;

/** Cadence du moteur : un prix par actif et par seconde. */
export const TICK_INTERVAL_MS = 1_000;

/** Le prix d'un actif est recopié dans le carnet toutes les N secondes. */
export const MARK_EVERY_TICKS = 3;

/** Durée de conservation de l'historique. */
export const RETENTION_HOURS = 24;

export const HISTORY_RANGES = {
  '5m': { windowMs: 5 * 60_000, bucket: '1 second' },
  '1h': { windowMs: 60 * 60_000, bucket: '10 seconds' },
  '24h': { windowMs: 24 * 60 * 60_000, bucket: '5 minutes' },
} as const;

export type HistoryRange = keyof typeof HISTORY_RANGES;
