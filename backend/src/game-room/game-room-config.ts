import { PANIC_TUESDAY_SCENARIO } from './scenario/panic-tuesday.scenario.js';

/** Actifs négociables : symboles internes de la plateforme (cf. market-assets.ts). */
export type RoomAssets = string[];

/**
 * Paires proposées au Meneur de Jeu mais absentes du catalogue de trading, qui
 * les découvre à la volée via Binance. Ce prix de référence ne sert qu'au marché
 * synthétique et au repli hors flux : il évite de coter ces actifs au prix de
 * l'or du scénario par défaut.
 */
export const ROOM_EXTRA_REFERENCE_PRICES: Record<string, number> = {
  'ETH/USDT': 2600,
  'SOL/USDT': 175,
  'BNB/USDT': 590,
  'XRP/USDT': 0.55,
};

export type GameRoomTimeframe = '1m' | '5m' | '15m' | '30m' | '1h';

export const TIMEFRAME_SECONDS: Record<GameRoomTimeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
};

/** Durées réelles de séance proposées au Meneur de Jeu, en minutes. */
export const REAL_DURATION_CHOICES = [1, 5, 10, 15, 30] as const;

/** Fenêtres de l'historique intégré (table `market_ticks`). */
export const HISTORY_RANGE_CHOICES = ['5m', '1h', '24h'] as const;
export type HistoryRangeChoice = (typeof HISTORY_RANGE_CHOICES)[number];

export const HISTORY_RANGE_SECONDS: Record<HistoryRangeChoice, number> = {
  '5m': 300,
  '1h': 3600,
  '24h': 86_400,
};

/** Une bougie importée depuis un CSV (mode `csv`). */
export interface CsvCandle {
  /** Horodatage ISO-8601 ou epoch millisecondes. */
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/** Événement planifié du marché synthétique. */
export interface SyntheticEvent {
  /** Instant de déclenchement, en % de la durée totale de la simulation. */
  atPercent: number;
  /** Saut de prix appliqué à partir de cet instant, en %. */
  priceJumpPercent: number;
  label?: string;
}

export interface MarketSourceConfig {
  /** Actif suivi (modes `live` et `historical`). */
  symbol?: string;
  /** Prix de départ du marché synthétique. */
  initialPrice?: number;
  /** Amplitude du bruit sur toute la séance, en %. */
  volatilityPercent?: number;
  /** Dérive imposée sur toute la séance, en % (négatif = baisse). */
  trendPercent?: number;
  /** Graine : deux salles avec la même graine rejouent la même série. */
  seed?: number;
  events?: SyntheticEvent[];
  /** Fenêtre de l'historique intégré rejouée. */
  historyRange?: HistoryRangeChoice;
  /** Bougies CSV importées, triées par horodatage croissant. */
  candles?: CsvCandle[];
}

export interface RoomTimeModel {
  /** Durée totale de la simulation, en secondes de simulation. */
  totalSimSeconds: number;
  /** Secondes de simulation par seconde réelle. */
  playbackSpeed: number;
  /** Durée réelle de la séance, en minutes. */
  durationMinutes: number;
  timeframe: GameRoomTimeframe;
  historyStartAt: Date | null;
  historyEndAt: Date | null;
}

export const DEFAULT_TIMEFRAME: GameRoomTimeframe = '1m';
export const DEFAULT_DURATION_MINUTES = 30;

export function isTimeframe(value: unknown): value is GameRoomTimeframe {
  return typeof value === 'string' && value in TIMEFRAME_SECONDS;
}

/**
 * Résout le modèle de temps d'une salle.
 *
 * - `scenario` : la durée du scénario est imposée, la vitesse en découle.
 * - `historical` / `csv` : la fenêtre de données est imposée, la vitesse en découle
 *   (6 h rejouées en 30 min → vitesse 12x).
 * - `synthetic` : la séance dure `durationMinutes` de simulation, la vitesse reste
 *   celle demandée (1x par défaut).
 * - `live` : horodatages réels, vitesse forcée à 1x.
 */
export function resolveTimeModel(params: {
  sourceMode: string;
  sourceConfig?: MarketSourceConfig;
  durationMinutes?: number;
  timeframe?: string;
  playbackSpeed?: number;
  historyStart?: string | Date | null;
  historyEnd?: string | Date | null;
  datasetSeconds?: number | null;
}): RoomTimeModel {
  const durationMinutes = Math.max(1, Math.round(params.durationMinutes ?? DEFAULT_DURATION_MINUTES));
  const timeframe = isTimeframe(params.timeframe) ? params.timeframe : DEFAULT_TIMEFRAME;
  const realSeconds = durationMinutes * 60;
  const toNullableDate = (value?: string | Date | null) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  let historyStartAt = toNullableDate(params.historyStart);
  let historyEndAt = toNullableDate(params.historyEnd);

  if (params.sourceMode === 'scenario') {
    const total = PANIC_TUESDAY_SCENARIO.durationMinutes * 60;
    return {
      totalSimSeconds: total,
      playbackSpeed: round(total / realSeconds),
      durationMinutes,
      timeframe,
      historyStartAt: null,
      historyEndAt: null,
    };
  }

  if (params.sourceMode === 'historical' || params.sourceMode === 'csv') {
    const range = params.sourceConfig?.historyRange ?? '24h';
    const datasetSeconds =
      params.datasetSeconds && params.datasetSeconds > 0
        ? Math.round(params.datasetSeconds)
        : HISTORY_RANGE_SECONDS[range] ?? HISTORY_RANGE_SECONDS['24h'];
    if (!historyStartAt || !historyEndAt) {
      historyEndAt = historyEndAt ?? historyStartAt ?? new Date();
      historyStartAt = new Date(historyEndAt.getTime() - datasetSeconds * 1000);
    }
    return {
      totalSimSeconds: datasetSeconds,
      playbackSpeed: round(datasetSeconds / realSeconds),
      durationMinutes,
      timeframe,
      historyStartAt,
      historyEndAt,
    };
  }

  if (params.sourceMode === 'live') {
    return {
      totalSimSeconds: realSeconds,
      playbackSpeed: 1,
      durationMinutes,
      timeframe,
      historyStartAt: null,
      historyEndAt: null,
    };
  }

  // Marché synthétique : la simulation dure autant que la séance réelle.
  const requested = params.playbackSpeed && params.playbackSpeed > 0 ? params.playbackSpeed : 1;
  return {
    totalSimSeconds: Math.round(realSeconds * requested),
    playbackSpeed: round(requested),
    durationMinutes,
    timeframe,
    historyStartAt: null,
    historyEndAt: null,
  };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

// ---------------------------------------------------------------------------
// Marché synthétique : série déterministe, identique pour tous les participants
// ---------------------------------------------------------------------------

function hash01(n: number, seed: number): number {
  const x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function valueNoise(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash01(i, seed);
  const b = hash01(i + 1, seed);
  const u = f * f * (3 - 2 * f);
  return (a + (b - a) * u) * 2 - 1;
}

/** Bruit fractal lissé dans [-1, 1], reproductible pour une graine donnée. */
function fbm(t: number, seed: number): number {
  let sum = 0;
  let amplitude = 1;
  let norm = 0;
  let frequency = 1 / 90; // octave de base : 90 secondes de simulation
  for (let octave = 0; octave < 5; octave++) {
    sum += amplitude * valueNoise(t * frequency, seed + octave * 17);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / norm;
}

/**
 * Prix du marché synthétique à l'instant `elapsedSeconds`.
 *
 * La dérive et la volatilité sont exprimées sur toute la séance : une volatilité
 * de 5 % produit un écart type de 5 % du prix initial en fin de séance.
 */
export function syntheticPrice(
  elapsedSeconds: number,
  totalSimSeconds: number,
  config: MarketSourceConfig = {},
): number {
  const initialPrice = config.initialPrice && config.initialPrice > 0 ? config.initialPrice : 2700;
  const volatility = (config.volatilityPercent ?? 5) / 100;
  const trend = (config.trendPercent ?? 0) / 100;
  const seed = Math.trunc(config.seed ?? 1);
  const total = Math.max(1, totalSimSeconds);
  const t = Math.max(0, Math.min(elapsedSeconds, total));
  const progress = t / total;

  const noise = fbm(t, seed);
  const drift = trend * progress;
  const sigma = volatility * Math.sqrt(progress);
  let price = initialPrice * Math.exp(drift + sigma * noise);

  for (const event of config.events ?? []) {
    const atPercent = Number(event?.atPercent);
    const jumpPercent = Number(event?.priceJumpPercent);
    if (!Number.isFinite(atPercent) || !Number.isFinite(jumpPercent)) continue;
    if (progress * 100 >= atPercent) {
      price *= 1 + jumpPercent / 100;
    }
  }

  return Math.round(price * 10_000) / 10_000;
}

/** Spread naturel d'un actif, en % du prix (le carnet d'ordres reste cohérent). */
export function naturalSpreadPercent(symbol: string): number {
  if (symbol.startsWith('BTC')) return 0.05;
  if (symbol.startsWith('EUR')) return 0.01;
  if (symbol.includes('JPY')) return 0.012;
  if (symbol === 'AAPL' || symbol === 'MSFT' || symbol === 'GOOGL' ||
      symbol === 'AMZN' || symbol === 'TSLA' || symbol === 'NVDA' || symbol === 'META') return 0.03;
  if (symbol === 'WTI/USD' || symbol === 'BRENT/USD') return 0.02;
  if (symbol === 'NATGAS/USD') return 0.04;
  if (symbol === 'XAG/USD' || symbol === 'COPPER/USD') return 0.025;
  return 0.012; // XAU/USD et défaut forex/crypto
}
