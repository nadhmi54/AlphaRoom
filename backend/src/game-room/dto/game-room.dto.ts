import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CATALOG_ASSETS, MARKET_ASSETS } from '../../portefeuille/trading/market-assets.js';
import { HISTORY_RANGE_CHOICES, ROOM_EXTRA_REFERENCE_PRICES } from '../game-room-config.js';

/** Actifs négociables proposés à la création d'une salle (les quatre marchés). */
export const ROOM_ASSET_CHOICES = [
  ...MARKET_ASSETS.map((asset) => asset.symbol),
  ...CATALOG_ASSETS.map((asset) => asset.symbol),
  ...Object.keys(ROOM_EXTRA_REFERENCE_PRICES),
];

export const SOURCE_MODES = ['scenario', 'synthetic', 'historical', 'csv', 'live'] as const;
export type SourceModeChoice = (typeof SOURCE_MODES)[number];

export const TIMEFRAME_CHOICES = ['1m', '5m', '15m', '30m', '1h'] as const;
export type TimeframeChoice = (typeof TIMEFRAME_CHOICES)[number];

/** Paramètres de la salle : identité, capital, frais et règles de risque. */
export class RoomSettingsDto {
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ROOM_ASSET_CHOICES.length)
  @IsIn(ROOM_ASSET_CHOICES, { each: true })
  @IsOptional()
  assets?: string[];

  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  maxParticipants?: number;

  @IsNumber()
  @Min(100)
  @Max(100_000_000)
  @IsOptional()
  initialCapital?: number;

  @IsIn(['USD', 'EUR'])
  @IsOptional()
  currency?: 'USD' | 'EUR';

  /** Multiplicateur du spread naturel (1 = spread normal, 4 = conditions stressées). */
  @IsNumber()
  @Min(0.1)
  @Max(50)
  @IsOptional()
  spreadMultiplier?: number;

  /** Commission en % du montant nominal de chaque exécution. */
  @IsNumber()
  @Min(0)
  @Max(5)
  @IsOptional()
  commissionPercent?: number;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  leverage?: number;

  @IsBoolean()
  @IsOptional()
  allowShortSelling?: boolean;

  @IsNumber()
  @Min(1)
  @Max(1_000_000_000)
  @IsOptional()
  maxExposure?: number;

  /** Perte maximale par position, en % du capital initial (impose un Stop-Loss). */
  @IsNumber()
  @Min(0.1)
  @Max(100)
  @IsOptional()
  riskLimitPercent?: number;
}

/** Source de données marché et ses paramètres propres. */
export class MarketSourceDto {
  @IsIn(SOURCE_MODES as unknown as string[])
  mode!: SourceModeChoice;

  /** Actif suivi en mode live / historique (défaut : premier actif de la salle). */
  @IsString()
  @IsOptional()
  symbol?: string;

  @IsNumber()
  @Min(0.0001)
  @Max(10_000_000)
  @IsOptional()
  initialPrice?: number;

  /** Amplitude du bruit sur toute la séance synthétique, en %. */
  @IsNumber()
  @Min(0)
  @Max(200)
  @IsOptional()
  volatilityPercent?: number;

  /** Dérive imposée sur toute la séance synthétique, en %. */
  @IsNumber()
  @Min(-99)
  @Max(1000)
  @IsOptional()
  trendPercent?: number;

  @IsInt()
  @Min(1)
  // 8 chiffres : accepte les graines au format date (AAAAMMJJ) utilisées par défaut
  @Max(99_999_999)
  @IsOptional()
  seed?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyntheticEventDto)
  @IsOptional()
  events?: SyntheticEventDto[];

  @IsIn(HISTORY_RANGE_CHOICES as unknown as string[])
  @IsOptional()
  historyRange?: (typeof HISTORY_RANGE_CHOICES)[number];

  /** Bougies issues d'un CSV déjà validé via POST /game-room/preview-csv. */
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(20_000)
  @ValidateNested({ each: true })
  @Type(() => CsvCandleDto)
  @IsOptional()
  candles?: CsvCandleDto[];

  /** Contenu brut du CSV : le serveur le reparse et l'emporte sur `candles`. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(4_000_000)
  @IsOptional()
  csvContent?: string;
}

export class SyntheticEventDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  atPercent!: number;

  @IsNumber()
  @Min(-90)
  @Max(1000)
  priceJumpPercent!: number;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  label?: string;
}

export class CsvCandleDto {
  @IsString()
  @IsNotEmpty()
  timestamp!: string;

  @IsNumber()
  @Min(0)
  open!: number;

  @IsNumber()
  @Min(0)
  high!: number;

  @IsNumber()
  @Min(0)
  low!: number;

  @IsNumber()
  @Min(0)
  close!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  volume?: number;
}

/** Configuration du temps : durée réelle, fenêtre historique, bougies, vitesse. */
export class TimeConfigDto {
  @IsInt()
  @Min(1)
  @Max(240)
  @IsOptional()
  durationMinutes?: number;

  @IsIn(TIMEFRAME_CHOICES as unknown as string[])
  @IsOptional()
  timeframe?: TimeframeChoice;

  /** Vitesse de relecture ; recalculée automatiquement si absente. */
  @IsNumber()
  @Min(0.1)
  @Max(1000)
  @IsOptional()
  playbackSpeed?: number;

  /** Début de la fenêtre historique rejouée (ISO-8601). */
  @IsString()
  @IsOptional()
  startAt?: string;

  /** Fin de la fenêtre historique rejouée (ISO-8601). */
  @IsString()
  @IsOptional()
  endAt?: string;
}

/**
 * Création d'une salle. Les classes imbriquées sont déclarées plus haut :
 * `emitDecoratorMetadata` évalue `design:type` dès la définition de la classe.
 */
export class CreateGameRoomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsOptional()
  scenarioId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RoomSettingsDto)
  config?: RoomSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MarketSourceDto)
  source?: MarketSourceDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TimeConfigDto)
  time?: TimeConfigDto;
}

/** Modification de la configuration d'une salle encore en attente. */
export class UpdateGameRoomConfigDto {
  @IsString()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RoomSettingsDto)
  config?: RoomSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MarketSourceDto)
  source?: MarketSourceDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TimeConfigDto)
  time?: TimeConfigDto;
}

export class JoinGameRoomDto {
  @IsString()
  @IsNotEmpty()
  codeOrId!: string;

  @IsString()
  @IsOptional()
  nickname?: string;
}

export class PlaceSimOrderDto {
  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @IsString()
  @IsIn(['buy', 'sell'])
  side!: 'buy' | 'sell';

  @IsString()
  @IsIn(['market', 'limit'])
  type!: 'market' | 'limit';

  @IsNumber()
  @Min(0.000001)
  quantity!: number;

  @IsNumber()
  @IsOptional()
  limitPrice?: number;

  @IsNumber()
  @IsOptional()
  stopLoss?: number;

  @IsNumber()
  @IsOptional()
  takeProfit?: number;
}

export class ClosePositionDto {
  @IsString()
  @IsOptional()
  symbol?: string;
}

export class GameMasterActionDto {
  @IsString()
  @IsNotEmpty()
  type!: 'PRICE_SHOCK' | 'VOLATILITY_SHOCK' | 'SPREAD_SHOCK' | 'LIQUIDITY_SHOCK' | 'NEWS' | 'WHALE' | 'ROLLBACK';

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  payload?: Record<string, any>;
}

export class RoomControlDto {
  @IsString()
  @IsIn(['start', 'pause', 'resume', 'reset', 'finish'])
  action!: 'start' | 'pause' | 'resume' | 'reset' | 'finish';
}

/** Vitesse de relecture (1x = temps réel, 12x = 6 h jouées en 30 min). */
export class RoomSpeedDto {
  @IsNumber()
  @Min(0.1)
  @Max(1000)
  speed!: number;
}

/** Position du curseur de séance, en secondes de simulation. */
export class RoomSeekDto {
  @IsInt()
  @Min(0)
  seconds!: number;
}

/** Contenu brut d'un fichier CSV de bougies, validé avant création de la salle. */
export class CsvPreviewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4_000_000)
  content!: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  filename?: string;
}
