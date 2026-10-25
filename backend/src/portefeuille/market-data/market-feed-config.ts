export type FeedProvider = 'binance' | 'finnhub';

export interface FeedSpec {
  /** Symbole interne de la simulation (celui de `market-assets.ts`). */
  symbol: string;
  provider: FeedProvider;
  /** Symbole chez le fournisseur (Binance : minuscules, Finnhub : tel quel). */
  providerSymbol: string;
  /** Volatilité annuelle utilisée par la simulation de repli. */
  annualVolatility: number;
}

/**
 * Où trouver le prix réel de chaque actif.
 *
 * - BTC/USD : paire BTCUSDT de Binance (24 h/24, sans clé).
 * - XAU/USD : PAXGUSDT de Binance. PAXG est un jeton adossé à une once d'or ;
 *   son prix suit l'or au comptant de près et se négocie aussi le week-end.
 * - EUR/USD : EURUSDT de Binance (l'USDT vaut ~1 $).
 * - AAPL : flux d'actions US de Finnhub (clé gratuite FINNHUB_API_KEY).
 *   Sans clé ou hors séance, l'actif passe en simulation.
 */
export const FEED_SPECS: readonly FeedSpec[] = [
  { symbol: 'XAU/USD', provider: 'binance', providerSymbol: 'paxgusdt', annualVolatility: 0.16 },
  { symbol: 'EUR/USD', provider: 'binance', providerSymbol: 'eurusdt', annualVolatility: 0.08 },
  { symbol: 'BTC/USD', provider: 'binance', providerSymbol: 'btcusdt', annualVolatility: 0.55 },
  { symbol: 'AAPL', provider: 'finnhub', providerSymbol: 'AAPL', annualVolatility: 0.3 },
];

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
