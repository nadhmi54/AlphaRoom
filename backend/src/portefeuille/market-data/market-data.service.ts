import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { MARKET_ASSETS, findMarketAsset } from '../trading/market-assets.js';
import { BinanceFeed } from './binance-feed.js';
import { FinnhubFeed } from './finnhub-feed.js';
import {
  FEED_SPECS,
  HISTORY_RANGES,
  MARK_EVERY_TICKS,
  RETENTION_HOURS,
  TICK_INTERVAL_MS,
  type HistoryRange,
} from './market-feed-config.js';
import { PriceBook, type PriceState, type RealTick } from './price-book.js';
import type { WsFeed } from './ws-feed.js';

/** Même espace de verrou que le carnet d'ordres : voir OrderBookService.lockSymbol. */
const ADVISORY_NAMESPACE = 'alpharoom.order_book';

/** 300 points d'une seconde = les 5 dernières minutes gardées en mémoire. */
const BUFFER_SIZE = 300;
const SPARK_STEP = 5;
const PURGE_EVERY_TICKS = 600;
const BASELINE_EVERY_TICKS = 30;

interface BufferPoint {
  t: number;
  price: number;
}

export interface MarketQuote {
  symbol: string;
  name: string;
  unit: string;
  category: string;
  price: number;
  source: 'live' | 'simulated';
  updatedAt: string;
  /** Variation depuis le plus ancien prix gardé (24 h au plus). */
  changePercent: number;
  changeSince: string | null;
  /** Les 5 dernières minutes, un point toutes les 5 s, pour la mini-courbe. */
  spark: number[];
}

@Injectable()
export class MarketDataService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketDataService.name);
  private book: PriceBook | null = null;
  private feeds: WsFeed[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;
  private lastStepAt = 0;
  private running = false;
  private readonly states = new Map<string, PriceState>();
  private readonly buffers = new Map<string, BufferPoint[]>();
  private readonly baselines = new Map<string, { price: number; ts: Date }>();
  private readonly lastWarn = new Map<string, number>();

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /** Remplaçable dans les tests pour ne jamais ouvrir de vraie connexion. */
  feedFactory?: (onTick: (tick: RealTick) => void) => WsFeed[];

  // ---------------------------------------------------------------------------
  // Cycle de vie
  // ---------------------------------------------------------------------------

  async onModuleInit(): Promise<void> {
    if (!this.enabled()) {
      this.logger.log('Service de prix désactivé (tests ou MARKET_DATA_ENABLED=false).');
      return;
    }
    await this.start();
  }

  onModuleDestroy(): void {
    this.stop();
  }

  private enabled(): boolean {
    return (
      process.env.NODE_ENV !== 'test' &&
      this.config.get<string>('MARKET_DATA_ENABLED') !== 'false'
    );
  }

  /** Démarre le moteur et les flux. Public pour les tests. */
  async start(random: () => number = Math.random): Promise<void> {
    const initial = await this.loadInitialPrices();
    this.book = new PriceBook(FEED_SPECS, initial, random);
    this.lastStepAt = Date.now();
    await this.guard('variation', () => this.refreshBaselines());

    const onTick = (tick: RealTick) => this.book?.recordReal(tick);
    this.feeds = this.feedFactory ? this.feedFactory(onTick) : this.createFeeds(onTick);
    for (const feed of this.feeds) feed.start();

    this.timer = setInterval(() => void this.runTick(Date.now()), TICK_INTERVAL_MS);
    this.timer.unref?.();
    this.logger.log(`Moteur de prix démarré (${FEED_SPECS.length} actifs, 1 prix/s).`);
  }

  private createFeeds(onTick: (tick: RealTick) => void): WsFeed[] {
    const binanceSpecs = FEED_SPECS.filter((spec) => spec.provider === 'binance');
    const feeds: WsFeed[] = [new BinanceFeed(binanceSpecs, onTick)];

    const finnhubKey = this.config.get<string>('FINNHUB_API_KEY');
    const finnhubSpecs = FEED_SPECS.filter((spec) => spec.provider === 'finnhub');
    if (finnhubKey) {
      feeds.push(new FinnhubFeed(finnhubSpecs, finnhubKey, onTick));
    } else {
      this.logger.warn(
        'FINNHUB_API_KEY absente : les actions (AAPL) resteront en simulation. ' +
          'Crée une clé gratuite sur finnhub.io et ajoute-la dans backend/.env.',
      );
    }
    return feeds;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const feed of this.feeds) feed.stop();
    this.feeds = [];
  }

  // ---------------------------------------------------------------------------
  // Moteur : un pas par seconde
  // ---------------------------------------------------------------------------

  /** Reçoit un prix réel (utilisé par les flux et par les tests). */
  ingest(tick: RealTick): void {
    this.book?.recordReal(tick);
  }

  async runTick(now: number): Promise<void> {
    if (!this.book || this.running) return;
    this.running = true;
    try {
      const dt = Math.max((now - this.lastStepAt) / 1000, 0.1);
      this.lastStepAt = now;
      const states = this.book.step(now, Math.min(dt, 5));
      this.ticks += 1;

      for (const state of states) {
        if (this.states.get(state.symbol)?.source !== state.source) {
          this.logger.log(
            `${state.symbol} : ${state.source === 'live' ? 'prix réel reçu' : 'simulation (pas de flux réel)'}`,
          );
        }
        this.states.set(state.symbol, state);
        const buffer = this.buffers.get(state.symbol) ?? [];
        buffer.push({ t: now, price: state.price });
        if (buffer.length > BUFFER_SIZE) buffer.shift();
        this.buffers.set(state.symbol, buffer);
      }

      await this.guard('enregistrement des prix', () => this.persist(states, now));
      if (this.ticks % MARK_EVERY_TICKS === 0) {
        await this.guard('mise à jour du carnet', () => this.updateMarks(states));
      }
      if (this.ticks % PURGE_EVERY_TICKS === 0) {
        await this.guard('purge', () => this.purge());
      }
      if (this.ticks % BASELINE_EVERY_TICKS === 0) {
        await this.guard('variation', () => this.refreshBaselines());
      }
    } finally {
      this.running = false;
    }
  }

  private async persist(states: PriceState[], now: number): Promise<void> {
    if (states.length === 0) return;
    await this.dataSource.query(
      `insert into public.market_ticks (symbol, price, source, ts)
       select * from unnest($1::varchar[], $2::numeric[], $3::varchar[], $4::timestamptz[])`,
      [
        states.map((s) => s.symbol),
        states.map((s) => s.price.toFixed(6)),
        states.map((s) => s.source),
        states.map(() => new Date(now).toISOString()),
      ],
    );
  }

  /**
   * Recopie le prix dans `order_book_marks`. Le carnet reconstruit sa liquidité
   * autour de ce prix et le portefeuille valorise les positions avec : la
   * courbe, le carnet et le P&L latent restent donc d'accord. On ne touche pas
   * à `last_trade_at` (date du dernier échange réel). Le verrou est celui du
   * carnet : une mise à jour ne passe jamais au milieu d'un appariement.
   */
  private async updateMarks(states: PriceState[]): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      for (const state of states) {
        const price = Number(state.price.toFixed(4));
        if (!(price > 0)) continue;
        await manager.query('select pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
          ADVISORY_NAMESPACE,
          state.symbol,
        ]);
        await manager.query(
          `insert into public.order_book_marks (symbol, last_price, last_trade_at, updated_at)
           values ($1, $2, clock_timestamp(), clock_timestamp())
           on conflict (symbol) do update
             set last_price = excluded.last_price,
                 updated_at = excluded.updated_at`,
          [state.symbol, price.toFixed(4)],
        );
      }
    });
  }

  private async purge(): Promise<void> {
    await this.dataSource.query(
      `delete from public.market_ticks where ts < now() - make_interval(hours => $1)`,
      [RETENTION_HOURS],
    );
  }

  private async refreshBaselines(): Promise<void> {
    const rows = (await this.dataSource.query(
      `select distinct on (symbol) symbol, price, ts
         from public.market_ticks
        where ts >= now() - make_interval(hours => $1)
        order by symbol, ts asc`,
      [RETENTION_HOURS],
    )) as Array<{ symbol: string; price: string; ts: Date }>;
    for (const row of rows) {
      this.baselines.set(row.symbol, { price: Number(row.price), ts: new Date(row.ts) });
    }
  }

  private async loadInitialPrices(): Promise<Map<string, number>> {
    const prices = new Map(MARKET_ASSETS.map((asset) => [asset.symbol, asset.price]));
    try {
      const marks = (await this.dataSource.query(
        'select symbol, last_price from public.order_book_marks',
      )) as Array<{ symbol: string; last_price: string }>;
      for (const mark of marks) prices.set(mark.symbol, Number(mark.last_price));
      const ticks = (await this.dataSource.query(
        `select distinct on (symbol) symbol, price
           from public.market_ticks order by symbol, ts desc`,
      )) as Array<{ symbol: string; price: string }>;
      for (const tick of ticks) prices.set(tick.symbol, Number(tick.price));
    } catch (error) {
      this.logger.warn(`Prix initiaux : repli sur les prix de démonstration (${(error as Error).message}).`);
    }
    return prices;
  }

  /** Journalise une erreur au plus une fois par minute et par sujet. */
  private async guard(label: string, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      const last = this.lastWarn.get(label) ?? 0;
      if (Date.now() - last > 60_000) {
        this.lastWarn.set(label, Date.now());
        this.logger.warn(`Erreur (${label}) : ${(error as Error).message}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Lecture (API)
  // ---------------------------------------------------------------------------

  /** Dernier prix de chaque actif, avec sa mini-courbe. Aucune requête SQL. */
  quotes(): MarketQuote[] {
    return MARKET_ASSETS.map((asset) => {
      const state = this.states.get(asset.symbol);
      const buffer = this.buffers.get(asset.symbol) ?? [];
      const price = state?.price ?? asset.price;
      const baseline = this.baselines.get(asset.symbol);
      const base = baseline?.price ?? buffer[0]?.price ?? price;
      const spark = buffer.filter((_, index) => (buffer.length - 1 - index) % SPARK_STEP === 0);
      return {
        symbol: asset.symbol,
        name: asset.name,
        unit: asset.unit,
        category: asset.category,
        price,
        source: state?.source ?? 'simulated',
        updatedAt: new Date(buffer.at(-1)?.t ?? Date.now()).toISOString(),
        changePercent: base > 0 ? ((price - base) / base) * 100 : 0,
        changeSince: baseline?.ts.toISOString() ?? (buffer[0] ? new Date(buffer[0].t).toISOString() : null),
        spark: spark.map((point) => point.price),
      };
    });
  }

  /** Courbe d'un actif sur une période, ramenée à 300 points au plus. */
  async history(symbol: string, range: HistoryRange) {
    if (!findMarketAsset(symbol)) return { symbol, range, points: [], changePercent: 0 };
    const { windowMs, bucket } = HISTORY_RANGES[range];
    const since = new Date(Date.now() - windowMs);
    const rows = (await this.dataSource.query(
      `select distinct on (bucket) bucket as t, price, source
         from (
           select date_bin($3::interval, ts, timestamptz '2000-01-01') as bucket,
                  ts, price, source
             from public.market_ticks
            where symbol = $1 and ts >= $2
         ) bucketed
        order by bucket, ts desc`,
      [symbol, since.toISOString(), bucket],
    )) as Array<{ t: Date; price: string; source: 'live' | 'simulated' }>;

    let points = rows.map((row) => ({
      t: new Date(row.t).toISOString(),
      price: Number(row.price),
      source: row.source,
    }));
    if (points.length < 2) {
      // Base vide (premier démarrage) : on montre au moins la mémoire du moteur.
      const state = this.states.get(symbol);
      points = (this.buffers.get(symbol) ?? []).map((point) => ({
        t: new Date(point.t).toISOString(),
        price: point.price,
        source: state?.source ?? 'simulated',
      }));
    }
    const first = points[0]?.price ?? 0;
    const last = points.at(-1)?.price ?? 0;
    return {
      symbol,
      range,
      points,
      changePercent: first > 0 ? ((last - first) / first) * 100 : 0,
    };
  }
}
