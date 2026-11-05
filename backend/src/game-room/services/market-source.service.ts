import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameRoom } from '../entities/game-room.entity.js';
import { GameSnapshot } from '../entities/game-snapshot.entity.js';
import { MarketDataService } from '../../portefeuille/market-data/market-data.service.js';
import {
  findMarketAsset,
  roundAssetPrice,
} from '../../portefeuille/trading/market-assets.js';
import {
  calculateScenarioPrice,
  PANIC_TUESDAY_SCENARIO,
} from '../scenario/panic-tuesday.scenario.js';
import {
  HISTORY_RANGE_SECONDS,
  TIMEFRAME_SECONDS,
  naturalSpreadPercent,
  syntheticPrice,
  type CsvCandle,
  type GameRoomTimeframe,
  type HistoryRangeChoice,
  type MarketSourceConfig,
} from '../game-room-config.js';

export interface RoomShocks {
  priceOffset: number;
  spreadMultiplier: number;
  liquidityFactor: number;
}

export const NEUTRAL_SHOCKS: RoomShocks = {
  priceOffset: 0,
  spreadMultiplier: 1,
  liquidityFactor: 1,
};

export interface MarketState {
  symbol: string;
  price: number;
  spread: number;
  currentMinute: number;
  elapsedSeconds: number;
  totalSeconds: number;
  /** Provenance effective du prix affiché aux participants. */
  source: 'scenario' | 'synthetic' | 'historical' | 'csv' | 'live';
  /** Instant de marché correspondant au prix (réel en live, rejoué en historique). */
  timestamp: string;
  shocks: RoomShocks;
}

export interface SeriesPoint {
  t: number;
  price: number;
}

export interface CandlePoint {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface DatasetPoint {
  /** Secondes depuis le début du jeu de données. */
  offset: number;
  price: number;
}

interface DatasetCache {
  loadedAt: number;
  spanSeconds: number;
  points: DatasetPoint[];
}

const LIVE_BUCKET_SECONDS = 2;
const DATASET_CACHE_MS = 60_000;
const SERIES_MAX_POINTS = 400;

/**
 * Source de prix d'une Game Room.
 *
 * Le prix est toujours résolu côté serveur à partir de l'état de la salle : deux
 * étudiants qui interrogent la salle à la même seconde de simulation obtiennent
 * exactement le même prix, le même carnet et le même horodatage. En mode live, le
 * prix reçu du flux est figé dans `game_snapshots` pour que tous les participants
 * partagent la même référence.
 */
@Injectable()
export class MarketSourceService {
  private readonly logger = new Logger(MarketSourceService.name);
  private readonly shocks = new Map<string, RoomShocks>();
  private readonly datasets = new Map<string, DatasetCache>();

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(GameSnapshot) private readonly snapshots: Repository<GameSnapshot>,
    private readonly marketData: MarketDataService,
  ) {}

  // ---------------------------------------------------------------------------
  // Temps de simulation
  // ---------------------------------------------------------------------------

  /** Secondes de simulation écoulées, vitesse de relecture comprise. */
  calculateCurrentElapsedSeconds(room: GameRoom, now = Date.now()): number {
    const total = totalSimSeconds(room);
    if (room.status === 'waiting') return clamp(room.simElapsedSeconds ?? 0, total);
    if (room.status !== 'running' || !room.startedAt) return clamp(room.simElapsedSeconds ?? 0, total);
    const speed = playbackSpeed(room);
    const realSeconds = (now - new Date(room.startedAt).getTime()) / 1000;
    return clamp((room.simElapsedSeconds ?? 0) + realSeconds * speed, total);
  }

  getShocks(roomId: string): RoomShocks {
    return this.shocks.get(roomId) ?? { ...NEUTRAL_SHOCKS };
  }

  setShocks(roomId: string, shocks: RoomShocks): void {
    this.shocks.set(roomId, shocks);
  }

  resetRoomShocks(roomId: string): void {
    this.shocks.delete(roomId);
    this.datasets.delete(datasetKey(roomId, '*'));
  }

  /** Vide le cache du jeu de données historique d'une salle. */
  invalidateDataset(roomId: string): void {
    for (const key of this.datasets.keys()) {
      if (key.startsWith(`${roomId}:`)) this.datasets.delete(key);
    }
  }

  // ---------------------------------------------------------------------------
  // Résolution du prix
  // ---------------------------------------------------------------------------

  /** Actif principal de la salle (le premier configuré). */
  primarySymbol(room: GameRoom): string {
    const assets = Array.isArray(room.assets) && room.assets.length > 0 ? room.assets : ['XAU/USD'];
    return assets[0];
  }

  roomSymbols(room: GameRoom): string[] {
    return Array.isArray(room.assets) && room.assets.length > 0 ? room.assets : ['XAU/USD'];
  }

  async getMarketState(room: GameRoom, symbol?: string): Promise<MarketState> {
    const active = symbol ?? this.primarySymbol(room);
    const elapsed = this.calculateCurrentElapsedSeconds(room);
    const shocks = this.getShocks(room.id);
    const config = room.sourceConfig ?? {};

    const base = await this.resolveBasePrice(room, active, elapsed, config);
    // Précision propre à l'actif : un arrondi fixe à 2 décimales figeait EUR/USD,
    // XAG/USD, NATGAS/USD et XRP/USDT (variation affichée à 0,00 %).
    const price = roundAssetPrice(active, Math.max(0.000001, base.price + shocks.priceOffset));
    const spread = roundAssetPrice(
      active,
      Math.max(0.000001, base.spread * Number(room.spreadMultiplier ?? 1) * shocks.spreadMultiplier),
    );

    return {
      symbol: active,
      price,
      spread,
      currentMinute: Math.round((elapsed / 60) * 10) / 10,
      elapsedSeconds: elapsed,
      totalSeconds: totalSimSeconds(room),
      source: base.source,
      timestamp: this.resolveTimestamp(room, elapsed, base.source).toISOString(),
      shocks,
    };
  }

  /** Prix de tous les actifs de la salle, dans l'ordre de configuration. */
  async getMarketStates(room: GameRoom): Promise<MarketState[]> {
    return Promise.all(this.roomSymbols(room).map((symbol) => this.getMarketState(room, symbol)));
  }

  private async resolveBasePrice(
    room: GameRoom,
    symbol: string,
    elapsed: number,
    config: MarketSourceConfig,
  ): Promise<{ price: number; spread: number; source: MarketState['source'] }> {
    switch (room.sourceMode) {
      case 'synthetic': {
        const price = syntheticPrice(elapsed, totalSimSeconds(room), this.syntheticConfig(symbol, config));
        return { price, spread: spreadFromPrice(symbol, price), source: 'synthetic' };
      }
      case 'historical': {
        const dataset = await this.loadHistoricalDataset(room, symbol);
        if (dataset.points.length >= 2) {
          const total = totalSimSeconds(room);
          const synCfg = this.syntheticConfig(symbol, config);
          const price = interpolateOrContinue(dataset.points, elapsed, total, synCfg);
          return {
            price,
            spread: spreadFromPrice(symbol, price),
            source: elapsed > dataset.spanSeconds ? 'synthetic' : 'historical',
          };
        }
        const fallback = syntheticPrice(elapsed, totalSimSeconds(room), this.syntheticConfig(symbol, config));
        return { price: fallback, spread: spreadFromPrice(symbol, fallback), source: 'synthetic' };
      }
      case 'csv': {
        const points = csvPoints(config.candles);
        if (points.length >= 2) {
          const total = totalSimSeconds(room);
          const synCfg = this.syntheticConfig(symbol, config);
          const price = interpolateOrContinue(points, elapsed, total, synCfg);
          const dataSpan = points[points.length - 1].offset;
          return {
            price,
            spread: spreadFromPrice(symbol, price),
            source: elapsed > dataSpan ? 'synthetic' : 'csv',
          };
        }
        const fallback = syntheticPrice(elapsed, totalSimSeconds(room), this.syntheticConfig(symbol, config));
        return { price: fallback, spread: spreadFromPrice(symbol, fallback), source: 'synthetic' };
      }
      case 'live': {
        const live = await this.livePrice(room, symbol, elapsed);
        return {
          price: live.price,
          spread: spreadFromPrice(symbol, live.price),
          // Si le flux réel n'a pas de tick frais, le moteur renvoie un prix
          // simulé autour du dernier tick : on ne le présente pas comme live.
          source: live.source,
        };
      }
      case 'scenario':
      default: {
        const scenario = calculateScenarioPrice(elapsed, 0);
        return { price: scenario.price, spread: scenario.spread, source: 'scenario' };
      }
    }
  }

  private syntheticConfig(symbol: string, config: MarketSourceConfig): MarketSourceConfig {
    return {
      ...config,
      initialPrice:
        config.initialPrice && config.initialPrice > 0
          ? config.initialPrice
          : this.referencePrice(symbol),
    };
  }

  /**
   * Ancre réelle d'un actif de salle. Le moteur de prix est prioritaire (dernier
   * prix live ou simulé autour du dernier tick réel), puis le prix bootstrap du
   * catalogue. Aucune table de prix statique spécifique à la Game Room.
   */
  private referencePrice(symbol: string): number {
    const engine = this.marketData.quoteFor(symbol);
    if (engine && engine.price > 0) return engine.price;
    const known = findMarketAsset(symbol)?.price;
    if (known && known > 0) return known;
    return PANIC_TUESDAY_SCENARIO.initialPrice;
  }

  /**
   * Prix live partagé : le premier appelant d'un intervalle de 2 secondes enregistre
   * le prix du flux, les suivants relisent la même valeur (index unique partiel).
   */
  private async livePrice(
    room: GameRoom,
    symbol: string,
    elapsed: number,
  ): Promise<{ price: number; source: 'live' | 'synthetic' }> {
    const bucket = Math.floor(elapsed / LIVE_BUCKET_SECONDS) * LIVE_BUCKET_SECONDS;
    const stored = await this.readLiveSnapshot(room.id, bucket, symbol);
    if (stored !== null) {
      // Le snapshot partagé ne stocke que le prix ; la provenance est relue
      // dans le moteur (toujours la même source de vérité).
      const current = this.marketData.quoteFor(symbol);
      return { price: stored, source: current?.source === 'live' ? 'live' : 'synthetic' };
    }

    const quote = this.marketData.quoteFor(symbol);
    const price = roundAssetPrice(symbol, quote?.price ?? findMarketAsset(symbol)?.price ?? 0);
    if (price <= 0) {
      this.logger.warn(`Aucun prix disponible pour ${symbol} : repli sur le marché synthétique.`);
      return {
        price: syntheticPrice(
          elapsed,
          totalSimSeconds(room),
          this.syntheticConfig(symbol, room.sourceConfig ?? {}),
        ),
        source: 'synthetic',
      };
    }
    const source: 'live' | 'synthetic' = quote?.source === 'live' ? 'live' : 'synthetic';

    await this.dataSource.query(
      `insert into public.game_snapshots (room_id, sim_elapsed_seconds, state)
       values ($1, $2, $3::jsonb)
       on conflict do nothing`,
      [
        room.id,
        bucket,
        JSON.stringify({
          kind: 'live_price',
          symbol,
          price,
          source,
          recordedAt: new Date().toISOString(),
        }),
      ],
    );

    const winner = await this.readLiveSnapshot(room.id, bucket, symbol);
    return { price: winner ?? price, source };
  }

  private async readLiveSnapshot(roomId: string, bucket: number, symbol: string): Promise<number | null> {
    const rows = (await this.dataSource.query(
      `select state->>'price' as price
         from public.game_snapshots
        where room_id = $1
          and sim_elapsed_seconds = $2
          and state->>'kind' = 'live_price'
          and state->>'symbol' = $3
        order by created_at asc
        limit 1`,
      [roomId, bucket, symbol],
    )) as Array<{ price: string }>;
    if (rows.length === 0) return null;
    const price = Number(rows[0].price);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  private async loadHistoricalDataset(room: GameRoom, symbol: string): Promise<DatasetCache> {
    const key = datasetKey(room.id, symbol);
    const cached = this.datasets.get(key);
    if (cached && Date.now() - cached.loadedAt < DATASET_CACHE_MS) return cached;

    const range: HistoryRangeChoice = room.sourceConfig?.historyRange ?? '24h';
    let points: DatasetPoint[] = [];
    let spanSeconds = HISTORY_RANGE_SECONDS[range];
    try {
      const history = await this.marketData.history(symbol, range);
      const stamps = history.points.map((point) => new Date(point.t).getTime());
      if (stamps.length >= 2) {
        const start = stamps[0];
        spanSeconds = Math.max(1, Math.round((stamps[stamps.length - 1] - start) / 1000));
        points = history.points.map((point, index) => ({
          offset: Math.round((stamps[index] - start) / 1000),
          price: Number(point.price),
        }));
      }
    } catch (error) {
      this.logger.warn(`Historique intégré indisponible pour ${symbol} : ${(error as Error).message}`);
    }

    const dataset: DatasetCache = { loadedAt: Date.now(), spanSeconds, points };
    this.datasets.set(key, dataset);
    return dataset;
  }

  /** Durée réelle, en secondes, des données disponibles pour un replay historique. */
  async measureHistoricalSpan(symbol: string, range: HistoryRangeChoice): Promise<number | null> {
    try {
      const rows = (await this.dataSource.query(
        `select extract(epoch from (max(ts) - min(ts)))::int as span, count(*)::int as n
           from public.market_ticks
          where symbol = $1 and ts >= now() - make_interval(secs => $2)`,
        [symbol, HISTORY_RANGE_SECONDS[range]],
      )) as Array<{ span: number | null; n: number }>;
      if (!rows[0] || rows[0].n < 2 || !rows[0].span) return null;
      return rows[0].span;
    } catch (error) {
      this.logger.warn(`Mesure de l'historique impossible : ${(error as Error).message}`);
      return null;
    }
  }

  private resolveTimestamp(room: GameRoom, elapsed: number, source: MarketState['source']): Date {
    if (source === 'live') return new Date();
    if ((source === 'historical' || source === 'csv') && room.historyStartAt) {
      return new Date(new Date(room.historyStartAt).getTime() + elapsed * 1000);
    }
    if (room.startedAt) {
      const speed = playbackSpeed(room);
      return new Date(new Date(room.startedAt).getTime() + (elapsed / speed) * 1000);
    }
    return new Date();
  }

  // ---------------------------------------------------------------------------
  // Séries et bougies (identiques pour tous les participants)
  // ---------------------------------------------------------------------------

  /** Courbe du prix depuis la seconde 0 jusqu'à l'instant courant. */
  async buildSeries(room: GameRoom, symbol: string, elapsed: number): Promise<SeriesPoint[]> {
    const sample = await this.sampler(room, symbol);
    const shocks = this.getShocks(room.id);
    const points = Math.min(SERIES_MAX_POINTS, Math.max(2, Math.ceil(elapsed / 15) + 1));
    const step = elapsed > 0 ? elapsed / (points - 1) : 1;
    const series: SeriesPoint[] = [];
    for (let i = 0; i < points; i++) {
      const t = Math.round(i * step);
      series.push({
        t,
        price: roundAssetPrice(symbol, Math.max(0.000001, sample(t) + shocks.priceOffset)),
      });
    }
    const current = await this.getMarketState(room, symbol);
    if (series.at(-1)?.t !== current.elapsedSeconds) {
      series.push({ t: current.elapsedSeconds, price: current.price });
    }
    return series;
  }

  /** Bougies OHLC agrégées sur le timeframe choisi, jusqu'à l'instant courant. */
  async buildCandles(
    room: GameRoom,
    symbol: string,
    elapsed: number,
    timeframe?: string,
  ): Promise<CandlePoint[]> {
    const sample = await this.sampler(room, symbol);
    const shocks = this.getShocks(room.id);
    const at = (t: number) =>
      roundAssetPrice(symbol, Math.max(0.000001, sample(t) + shocks.priceOffset));
    const bucket = TIMEFRAME_SECONDS[(timeframe ?? room.timeframe) as GameRoomTimeframe] ?? 60;
    const candles: CandlePoint[] = [];
    const lastBucket = Math.floor(elapsed / bucket);
    // Au plus 120 bougies : on démarre assez loin pour couvrir la séance.
    const firstBucket = Math.max(0, lastBucket - 119);
    for (let index = firstBucket; index <= lastBucket; index++) {
      const start = index * bucket;
      const end = Math.min(start + bucket, Math.max(elapsed, start + 1));
      const samples = 4;
      let open = 0;
      let close = 0;
      let high = -Infinity;
      let low = Infinity;
      for (let s = 0; s <= samples; s++) {
        const price = at(Math.round(start + ((end - start) * s) / samples));
        if (s === 0) open = price;
        close = price;
        high = Math.max(high, price);
        low = Math.min(low, price);
      }
      candles.push({ t: start, open, high, low, close });
    }
    return candles;
  }

  /**
   * Fonction de prix synchronisée sur l'instant de simulation : chargée une fois
   * (jeu de données en cache, ou snapshots live en base) puis réutilisée pour toute
   * la série et toutes les bougies, afin d'éviter des centaines d'accès en base.
   */
  private async sampler(room: GameRoom, symbol: string): Promise<(t: number) => number> {
    const config = room.sourceConfig ?? {};
    const total = totalSimSeconds(room);
    const synthetic = (t: number) => syntheticPrice(t, total, this.syntheticConfig(symbol, config));

    switch (room.sourceMode) {
      case 'scenario':
        return (t) => calculateScenarioPrice(t, 0).price;
      case 'synthetic':
        return synthetic;
      case 'historical': {
        const dataset = await this.loadHistoricalDataset(room, symbol);
        if (dataset.points.length >= 2) {
          const synCfg = this.syntheticConfig(symbol, config);
          return (t) => interpolateOrContinue(dataset.points, t, total, synCfg);
        }
        return synthetic;
      }
      case 'csv': {
        const points = csvPoints(config.candles);
        if (points.length >= 2) {
          const synCfg = this.syntheticConfig(symbol, config);
          return (t) => interpolateOrContinue(points, t, total, synCfg);
        }
        return synthetic;
      }
      case 'live': {
        const points = await this.loadLivePoints(room.id, symbol);
        return points.length >= 2 ? (t) => interpolate(points, t) : synthetic;
      }
      default:
        return (t) => calculateScenarioPrice(t, 0).price;
    }
  }

  private async loadLivePoints(roomId: string, symbol: string): Promise<DatasetPoint[]> {
    try {
      const rows = (await this.dataSource.query(
        `select sim_elapsed_seconds as t, state->>'price' as price
           from public.game_snapshots
          where room_id = $1
            and state->>'kind' = 'live_price'
            and state->>'symbol' = $2
          order by sim_elapsed_seconds asc`,
        [roomId, symbol],
      )) as Array<{ t: number; price: string }>;
      return rows
        .map((row) => ({ offset: Number(row.t), price: Number(row.price) }))
        .filter((point) => Number.isFinite(point.offset) && Number.isFinite(point.price) && point.price > 0);
    } catch (error) {
      this.logger.warn(`Lecture des prix live impossible : ${(error as Error).message}`);
      return [];
    }
  }
}

// -----------------------------------------------------------------------------
// Fonctions pures
// -----------------------------------------------------------------------------

export function totalSimSeconds(room: GameRoom): number {
  const value = Number(room.totalSimSeconds);
  return Number.isFinite(value) && value > 0 ? value : PANIC_TUESDAY_SCENARIO.durationMinutes * 60;
}

export function playbackSpeed(room: GameRoom): number {
  const value = Number(room.playbackSpeed);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(Math.round(value), max));
}

function datasetKey(roomId: string, symbol: string): string {
  return `${roomId}:${symbol}`;
}

function spreadFromPrice(symbol: string, price: number): number {
  return Math.max(0.000001, (price * naturalSpreadPercent(symbol)) / 100);
}

/** Interpolation linéaire d'une série indexée en secondes de simulation. */
export function interpolate(points: DatasetPoint[], elapsed: number): number {
  if (points.length === 0) return 0;
  if (points.length === 1) return points[0].price;
  if (elapsed <= points[0].offset) return points[0].price;
  const last = points[points.length - 1];
  if (elapsed >= last.offset) return last.price;

  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (points[mid].offset <= elapsed) low = mid;
    else high = mid;
  }
  const a = points[low];
  const b = points[high];
  const span = b.offset - a.offset || 1;
  return a.price + ((b.price - a.price) * (elapsed - a.offset)) / span;
}

/**
 * Interpolation avec continuation synthétique : si le dataset est plus court
 * que la durée totale de simulation, on continue à partir du dernier prix connu
 * avec le modèle synthétique (bruit FBM + drift) au lieu de répéter le dernier prix.
 */
export function interpolateOrContinue(
  points: DatasetPoint[],
  elapsed: number,
  totalSim: number,
  config: MarketSourceConfig = {},
): number {
  if (points.length === 0) return 0;
  if (points.length === 1) return points[0].price;
  const last = points[points.length - 1];
  if (elapsed <= last.offset) {
    return interpolate(points, elapsed);
  }
  const remaining = Math.max(1, totalSim - last.offset);
  const over = elapsed - last.offset;
  return syntheticPrice(over, remaining, {
    ...config,
    initialPrice: last.price,
  });
}

/** Convertit les bougies CSV en série indexée en secondes depuis la première bougie. */
export function csvPoints(candles?: CsvCandle[]): DatasetPoint[] {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const parsed = candles
    .map((candle) => ({ offset: toEpochSeconds(candle.timestamp), price: Number(candle.close) }))
    .filter((point) => Number.isFinite(point.offset) && Number.isFinite(point.price) && point.price > 0)
    .sort((a, b) => a.offset - b.offset);
  if (parsed.length === 0) return [];
  const start = parsed[0].offset;
  return parsed.map((point) => ({ offset: point.offset - start, price: point.price }));
}

/** Durée couverte par des bougies CSV, en secondes. */
export function csvSpanSeconds(candles?: CsvCandle[]): number | null {
  const points = csvPoints(candles);
  if (points.length < 2) return null;
  return Math.max(1, points[points.length - 1].offset);
}

function toEpochSeconds(timestamp: string): number {
  if (/^\d+$/.test(String(timestamp).trim())) {
    const numeric = Number(timestamp);
    return numeric > 1e11 ? Math.round(numeric / 1000) : numeric;
  }
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? NaN : Math.round(date.getTime() / 1000);
}
