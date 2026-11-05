import { Logger } from '@nestjs/common';
import type { FeedSpec } from './market-feed-config.js';
import type { RealTick } from './price-book.js';
import type { MarketFeed } from './ws-feed.js';

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const REQUEST_TIMEOUT_MS = 8_000;

/** Cadence de polling : assez rapide pour une séance, assez douce pour Yahoo. */
export const YAHOO_POLL_MS = 10_000;

/** Une erreur n'est journalisée qu'une fois par actif et par fenêtre. */
const WARN_EVERY_MS = 5 * 60_000;

/**
 * Yahoo limite le débit : dix-sept requêtes simultanées déclenchent des HTTP 429.
 * On interroge par petits lots espacés, et un actif qui a été refusé attend
 * avant d'être réessayé (délai doublé à chaque échec, plafonné).
 */
const MAX_CONCURRENT = 4;
const BATCH_GAP_MS = 250;
const COOLDOWN_BASE_MS = 60_000;
const COOLDOWN_MAX_MS = 10 * 60_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        regularMarketTime?: number;
      };
    }>;
    error?: { description?: string } | null;
  };
}

export interface YahooQuote {
  price: number;
  /** Horodatage fournisseur, en millisecondes. */
  quoteTime: number;
}

/**
 * Lit la réponse Chart API de Yahoo. Exporté pour être testé sans réseau.
 * `null` si la réponse ne contient pas de prix exploitable.
 */
export function parseYahooChart(payload: unknown): YahooQuote | null {
  const meta = (payload as YahooChartResponse | null)?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const price = Number(meta.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  const seconds = Number(meta.regularMarketTime);
  const quoteTime =
    Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : Date.now();
  return { price, quoteTime };
}

/**
 * Flux REST Yahoo Finance pour les actions, matières premières et devises.
 *
 * Yahoo n'expose pas de WebSocket public sans clé : on interroge donc la Chart
 * API par polling. Le tick porte l'horodatage du fournisseur, pas celui de la
 * réception. Ainsi, hors séance (ou avec un flux différé), le PriceBook sait que
 * le prix n'est pas frais et bascule sur son repli simulé explicitement, au lieu
 * de laisser croire à une cotation live qui ne bougerait plus.
 */
export class YahooFeed implements MarketFeed {
  private readonly logger = new Logger(YahooFeed.name);
  private readonly lastWarn = new Map<string, number>();
  /** Instant avant lequel un actif refusé (429) n'est pas réinterrogé. */
  private readonly cooldowns = new Map<string, { until: number; failures: number }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = true;
  private polling = false;

  constructor(
    private readonly specs: readonly FeedSpec[],
    private readonly onTick: (tick: RealTick) => void,
    private readonly fetchImpl: FetchLike = (url, init) => globalThis.fetch(url, init),
    private readonly pollMs: number = YAHOO_POLL_MS,
  ) {}

  start(): void {
    if (!this.stopped || this.specs.length === 0) return;
    this.stopped = false;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), this.pollMs);
    this.timer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Interroge tous les actifs et transmet les prix valides. Public pour les tests. */
  async poll(): Promise<RealTick[]> {
    if (this.polling || this.stopped) return [];
    this.polling = true;
    try {
      const now = Date.now();
      const due = this.specs.filter((spec) => {
        const cooldown = this.cooldowns.get(spec.symbol);
        return !cooldown || cooldown.until <= now;
      });

      const ticks: RealTick[] = [];
      for (let i = 0; i < due.length; i += MAX_CONCURRENT) {
        if (this.stopped) break;
        const batch = due.slice(i, i + MAX_CONCURRENT);
        const results = await Promise.all(batch.map((spec) => this.fetchOne(spec)));
        for (const tick of results) if (tick) ticks.push(tick);
        if (i + MAX_CONCURRENT < due.length) await delay(BATCH_GAP_MS);
      }

      if (!this.stopped) for (const tick of ticks) this.onTick(tick);
      return ticks;
    } finally {
      this.polling = false;
    }
  }

  private async fetchOne(spec: FeedSpec): Promise<RealTick | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url = `${BASE}/${encodeURIComponent(spec.providerSymbol)}?interval=1m&range=1d`;
      const response = await this.fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; AlphaRoom/1.0)',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        // 429 = quota dépassé : inutile d'insister à chaque tour.
        if (response.status === 429) this.cool(spec.symbol);
        throw new Error(`HTTP ${response.status}`);
      }
      const quote = parseYahooChart(await response.json());
      if (!quote) throw new Error('réponse sans prix');
      this.cooldowns.delete(spec.symbol);
      // Un horodatage futur (horloge locale en avance) est ramené à maintenant.
      const at = Math.min(quote.quoteTime, Date.now());
      return { symbol: spec.symbol, price: quote.price, at };
    } catch (error) {
      this.warn(spec.symbol, (error as Error).message);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Met un actif au repos après un refus, avec un délai qui double à chaque échec. */
  private cool(symbol: string): void {
    const failures = (this.cooldowns.get(symbol)?.failures ?? 0) + 1;
    const wait = Math.min(COOLDOWN_BASE_MS * 2 ** (failures - 1), COOLDOWN_MAX_MS);
    this.cooldowns.set(symbol, { until: Date.now() + wait, failures });
  }

  private warn(symbol: string, message: string): void {
    const last = this.lastWarn.get(symbol) ?? 0;
    if (Date.now() - last < WARN_EVERY_MS) return;
    this.lastWarn.set(symbol, Date.now());
    this.logger.warn(`Yahoo ${symbol} indisponible : ${message}`);
  }
}
