/**
 * BinanceRestService — API REST publique Binance, sans clé.
 *
 * Utilisé pour la recherche d'actifs et la récupération de prix/historiques
 * pour des symboles arbitraires (au-delà des 4 actifs configurés).
 * Toutes les requêtes sont en lecture seule et ne nécessitent aucun compte.
 */
import { Injectable, Logger } from '@nestjs/common';

const BASE = 'https://api.binance.com';
const TIMEOUT_MS = 5_000;

/** Une paire Binance avec son prix actuel. */
export interface BinanceTicker {
  /** Symbole Binance (ex. ETHUSDT). */
  binanceSymbol: string;
  /** Symbole interne affiché (ex. ETH/USDT). */
  displaySymbol: string;
  /** Nom lisible déduit du symbole. */
  name: string;
  price: number;
}

/** Un point de bougie Binance ramené à ce qu'on utilise. */
export interface BinanceKline {
  t: string;   // ISO timestamp de l'ouverture de la bougie
  price: number; // prix de clôture
}

/** Paires mises en avant quand la recherche crypto est vide. */
const POPULAR = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'ADAUSDT',
  'DOGEUSDT',
  'AVAXUSDT',
  'LINKUSDT',
  'DOTUSDT',
] as const;

@Injectable()
export class BinanceRestService {
  private readonly logger = new Logger(BinanceRestService.name);
  private priceCache: { at: number; rows: Array<{ symbol: string; price: string }> } | null = null;

  /** Toutes les paires et leurs prix, avec un cache court (10 s). */
  private async allPrices(): Promise<Array<{ symbol: string; price: string }>> {
    if (this.priceCache && Date.now() - this.priceCache.at < 10_000) {
      return this.priceCache.rows;
    }
    const rows = (await this.fetch('/api/v3/ticker/price')) as Array<{
      symbol: string;
      price: string;
    }>;
    this.priceCache = { at: Date.now(), rows };
    return rows;
  }

  /** Récupère le prix spot d'un symbole Binance (ex. ETHUSDT). Retourne null si inconnu. */
  async getPrice(binanceSymbol: string): Promise<number | null> {
    try {
      const res = await this.fetch(`/api/v3/ticker/price?symbol=${encodeURIComponent(binanceSymbol.toUpperCase())}`);
      const price = Number((res as { price?: string }).price);
      return price > 0 ? price : null;
    } catch {
      return null;
    }
  }

  /**
   * Cherche des paires Binance dont le nom contient `query`.
   * On filtre uniquement les paires USDT pour simplifier l'affichage.
   * Retourne au maximum `limit` résultats.
   */
  async search(query: string, limit = 10): Promise<BinanceTicker[]> {
    const q = query.toUpperCase().trim();
    if (!q) return [];
    try {
      const rows = await this.allPrices();
      return rows
        .filter((row) => row.symbol.endsWith('USDT') && row.symbol.startsWith(q))
        .slice(0, limit)
        .map((row) => ({
          binanceSymbol: row.symbol,
          displaySymbol: this.toDisplay(row.symbol),
          name: this.toName(row.symbol),
          price: Number(row.price),
        }));
    } catch (error) {
      this.logger.warn(`Recherche Binance échouée pour "${query}": ${String(error)}`);
      return [];
    }
  }

  /** Paires populaires avec leur prix, pour les suggestions à vide. */
  async popular(limit = 10): Promise<BinanceTicker[]> {
    try {
      const rows = await this.allPrices();
      const prices = new Map(rows.map((row) => [row.symbol, Number(row.price)]));
      return POPULAR.map((symbol) => ({ symbol, price: prices.get(symbol) ?? 0 }))
        .filter((row) => row.price > 0)
        .slice(0, limit)
        .map((row) => ({
          binanceSymbol: row.symbol,
          displaySymbol: this.toDisplay(row.symbol),
          name: this.toName(row.symbol),
          price: row.price,
        }));
    } catch (error) {
      this.logger.warn(`Suggestions Binance indisponibles : ${String(error)}`);
      return [];
    }
  }

  /**
   * Retourne l'historique d'une paire Binance sous forme de klines (bougies).
   * range : '5m' → bougies 1s sur 5 min, '1h' → 1m sur 1h, '24h' → 5m sur 24h.
   */
  async getKlines(binanceSymbol: string, range: '5m' | '1h' | '24h'): Promise<BinanceKline[]> {
    const CONFIG = {
      '5m':  { interval: '1s',  limit: 300 },
      '1h':  { interval: '1m',  limit: 60  },
      '24h': { interval: '5m',  limit: 288 },
    } as const;
    const { interval, limit } = CONFIG[range];
    try {
      const rows = await this.fetch(
        `/api/v3/klines?symbol=${encodeURIComponent(binanceSymbol.toUpperCase())}&interval=${interval}&limit=${limit}`,
      ) as Array<[number, string, string, string, string, ...unknown[]]>;
      // Format Binance klines : [openTime, open, high, low, close, ...]
      return rows.map((row) => ({
        t: new Date(row[0]).toISOString(),
        price: Number(row[4]), // close price
      }));
    } catch (error) {
      this.logger.warn(`Klines Binance échouées pour "${binanceSymbol}" (${range}): ${String(error)}`);
      return [];
    }
  }

  /** Convertit ETHUSDT → ETH/USDT */
  toDisplay(binanceSymbol: string): string {
    if (binanceSymbol.endsWith('USDT')) return `${binanceSymbol.slice(0, -4)}/USDT`;
    if (binanceSymbol.endsWith('BTC'))  return `${binanceSymbol.slice(0, -3)}/BTC`;
    if (binanceSymbol.endsWith('ETH'))  return `${binanceSymbol.slice(0, -3)}/ETH`;
    return binanceSymbol;
  }

  /** Donne un nom lisible simple à partir du symbole de base. */
  toName(binanceSymbol: string): string {
    const base = binanceSymbol.replace(/USDT$|BTC$|ETH$/i, '');
    const NAMES: Record<string, string> = {
      ETH: 'Ethereum', BNB: 'BNB', SOL: 'Solana', XRP: 'XRP', ADA: 'Cardano',
      DOGE: 'Dogecoin', AVAX: 'Avalanche', LINK: 'Chainlink', DOT: 'Polkadot',
      MATIC: 'Polygon', UNI: 'Uniswap', LTC: 'Litecoin', ATOM: 'Cosmos',
      ALGO: 'Algorand', XLM: 'Stellar', VET: 'VeChain', SAND: 'The Sandbox',
      MANA: 'Decentraland', NEAR: 'NEAR Protocol', FTM: 'Fantom', AAVE: 'Aave',
      CRV: 'Curve', COMP: 'Compound', MKR: 'Maker', SUSHI: 'SushiSwap',
      SUI: 'Sui', APT: 'Aptos', ARB: 'Arbitrum', OP: 'Optimism',
      PEPE: 'Pepe', SHIB: 'Shiba Inu', FLOKI: 'Floki', WIF: 'dogwifhat',
      TRX: 'TRON', TON: 'Toncoin', HBAR: 'Hedera', ICP: 'Internet Computer',
      FIL: 'Filecoin', ETC: 'Ethereum Classic', BCH: 'Bitcoin Cash',
    };
    return NAMES[base] ?? base;
  }

  private async fetch(path: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await globalThis.fetch(`${BASE}${path}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as unknown;
    } finally {
      clearTimeout(timer);
    }
  }
}
