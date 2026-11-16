import { Injectable, Logger } from '@nestjs/common';
import { FEED_SPECS, type FeedSpec } from '../../portefeuille/market-data/market-feed-config.js';
import { findMarketAsset, type AssetCategory } from '../../portefeuille/trading/market-assets.js';
import type { Candle } from './indicators.js';

/**
 * Historique journalier RÉEL des actifs de la plateforme (crypto : Binance ; actions,
 * matières premières, devises : Yahoo Finance). Lecture seule, sans clé, avec cache :
 * l'analyse de marché n'a pas besoin de données à la seconde.
 */

// Adresses surchargeables (tests de bout en bout avec un faux serveur, sans réseau).
const BINANCE = process.env.MARKET_HISTORY_BINANCE_URL ?? 'https://api.binance.com';
const YAHOO = process.env.MARKET_HISTORY_YAHOO_URL ?? 'https://query1.finance.yahoo.com/v8/finance/chart';
const TIMEOUT_MS = 8_000;
/** Assez de bougies pour une moyenne mobile à 50 jours et un trimestre de rendement. */
export const HISTORY_DAYS = 130;
const CACHE_TTL_MS = 30 * 60_000;
const FAILURE_TTL_MS = 2 * 60_000;
const MAX_CONCURRENT = 4;

export type HistorySource = 'binance' | 'yahoo';

export interface AssetHistory {
  symbol: string;
  category: AssetCategory;
  candles: Candle[];
  source: HistorySource;
  /** Ticker utilisé chez le fournisseur (ex. « GC=F » pour l'or). */
  providerSymbol: string;
  /** Vrai si l'actif est suivi par un substitut (ex. PAXG pour l'or sur Binance). */
  proxy: boolean;
}

interface Origin {
  provider: HistorySource;
  providerSymbol: string;
  proxy: boolean;
}

/**
 * Sources de l'historique, dans l'ordre d'essai. L'or et l'euro sont cotés sur Binance par
 * des substituts (PAXG, EURUSDT) : on préfère le vrai cours chez Yahoo et on garde le
 * substitut en secours, en le signalant.
 */
const ORIGIN_OVERRIDES: Record<string, Origin[]> = {
  'XAU/USD': [
    { provider: 'yahoo', providerSymbol: 'GC=F', proxy: false },
    { provider: 'binance', providerSymbol: 'PAXGUSDT', proxy: true },
  ],
  'EUR/USD': [
    { provider: 'yahoo', providerSymbol: 'EURUSD=X', proxy: false },
    { provider: 'binance', providerSymbol: 'EURUSDT', proxy: true },
  ],
};

/** Actifs analysés (BTC/USD double BTC/USDT : un seul des deux). */
export function analysableSymbols(): string[] {
  return FEED_SPECS.map((spec) => spec.symbol).filter((symbol) => symbol !== 'BTC/USD');
}

export function originsFor(spec: FeedSpec): Origin[] {
  const override = ORIGIN_OVERRIDES[spec.symbol];
  if (override) return override;
  if (spec.provider === 'binance') return [{ provider: 'binance', providerSymbol: spec.providerSymbol.toUpperCase(), proxy: false }];
  return [{ provider: 'yahoo', providerSymbol: spec.providerSymbol, proxy: false }];
}

const dayOf = (millis: number) => (Number.isFinite(millis) && millis > 0 ? new Date(millis).toISOString().slice(0, 10) : '');
const valid = (c: Candle) => c.t !== '' && [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0);

/** Réponse Binance `/klines` : [openTime, open, high, low, close, …]. */
export function parseBinanceKlines(payload: unknown): Candle[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .flatMap((row): Candle[] => {
      if (!Array.isArray(row) || row.length < 5) return [];
      const candle = { t: dayOf(Number(row[0])), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]) };
      return valid(candle) ? [candle] : [];
    })
    .sort((a, b) => a.t.localeCompare(b.t));
}

/** Réponse Yahoo Chart API : timestamps + indicators.quote[0]. Les jours sans cotation (null) sont ignorés. */
export function parseYahooHistory(payload: unknown): Candle[] {
  const result = (payload as { chart?: { result?: Array<Record<string, unknown>> } } | null)?.chart?.result?.[0];
  const timestamps = result?.timestamp as number[] | undefined;
  const quote = (result?.indicators as { quote?: Array<Record<string, Array<number | null>>> } | undefined)?.quote?.[0];
  if (!Array.isArray(timestamps) || !quote) return [];
  const out: Candle[] = [];
  timestamps.forEach((seconds, i) => {
    const candle = { t: dayOf(seconds * 1000), open: Number(quote.open?.[i]), high: Number(quote.high?.[i]), low: Number(quote.low?.[i]), close: Number(quote.close?.[i]) };
    if (valid(candle)) out.push(candle);
  });
  // Yahoo peut répéter le jour en cours : on garde la dernière valeur de chaque jour.
  return [...new Map(out.map((c) => [c.t, c])).values()].sort((a, b) => a.t.localeCompare(b.t));
}

type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

@Injectable()
export class MarketHistoryService {
  private readonly logger = new Logger(MarketHistoryService.name);
  private readonly cache = new Map<string, { at: number; value: AssetHistory | null }>();
  private readonly inflight = new Map<string, Promise<AssetHistory | null>>();
  /** Remplaçable dans les tests (aucun appel réseau). */
  fetchImpl: FetchLike = (url, init) => globalThis.fetch(url, init);

  /** Historique d'un actif de la plateforme, ou null (jamais d'exception : l'analyse continue sans lui). */
  async get(symbol: string): Promise<AssetHistory | null> {
    const cached = this.cache.get(symbol);
    if (cached && Date.now() - cached.at < (cached.value ? CACHE_TTL_MS : FAILURE_TTL_MS)) return cached.value;
    const pending = this.inflight.get(symbol);
    if (pending) return pending;
    const job = this.load(symbol)
      .then((value) => {
        this.cache.set(symbol, { at: Date.now(), value });
        return value;
      })
      .finally(() => this.inflight.delete(symbol));
    this.inflight.set(symbol, job);
    return job;
  }

  /** Plusieurs actifs, par petits lots (Yahoo refuse les rafales). */
  async getMany(symbols: string[]): Promise<Array<AssetHistory | null>> {
    const out: Array<AssetHistory | null> = [];
    for (let i = 0; i < symbols.length; i += MAX_CONCURRENT) {
      out.push(...(await Promise.all(symbols.slice(i, i + MAX_CONCURRENT).map((s) => this.get(s)))));
    }
    return out;
  }

  private async load(symbol: string): Promise<AssetHistory | null> {
    const spec = FEED_SPECS.find((s) => s.symbol === symbol);
    if (!spec) return null;
    const category = findMarketAsset(symbol)?.category ?? 'crypto';
    for (const origin of originsFor(spec)) {
      try {
        const candles = origin.provider === 'binance' ? await this.binance(origin.providerSymbol) : await this.yahoo(origin.providerSymbol);
        if (candles.length >= 20) {
          return { symbol, category, candles: candles.slice(-HISTORY_DAYS), source: origin.provider, providerSymbol: origin.providerSymbol, proxy: origin.proxy };
        }
        this.logger.warn(`Historique ${symbol} trop court chez ${origin.provider} (${candles.length} bougies).`);
      } catch (error) {
        this.logger.warn(`Historique ${symbol} indisponible chez ${origin.provider} : ${(error as Error).message}`);
      }
    }
    return null;
  }

  private async binance(providerSymbol: string): Promise<Candle[]> {
    const json = await this.getJson(`${BINANCE}/api/v3/klines?symbol=${encodeURIComponent(providerSymbol)}&interval=1d&limit=${HISTORY_DAYS}`);
    return parseBinanceKlines(json);
  }

  private async yahoo(providerSymbol: string): Promise<Candle[]> {
    const json = await this.getJson(`${YAHOO}/${encodeURIComponent(providerSymbol)}?interval=1d&range=6mo`);
    return parseYahooHistory(json);
  }

  private async getJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; AlphaRoom/1.0)' }, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }
}
