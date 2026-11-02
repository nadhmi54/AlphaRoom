import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { FEED_SPECS, HISTORY_RANGES, type HistoryRange } from '../market-feed-config.js';

const VALID_SYMBOLS = FEED_SPECS.map((s) => s.symbol);

export class HistoryQueryDto {
  /** Symbole interne (XAU/USD, BTC/USD…). */
  @IsString()
  @MaxLength(20)
  @IsIn(VALID_SYMBOLS)
  symbol!: string;

  @IsOptional()
  @IsIn(Object.keys(HISTORY_RANGES))
  range: HistoryRange = '5m';
}

/** DTO pour la recherche d'actifs. */
export class SearchQueryDto {
  @IsString()
  @MaxLength(20)
  q!: string;
}

/** DTO pour le prix spot d'un seul symbole Binance. */
export class SpotQueryDto {
  @IsString()
  @MaxLength(20)
  symbol!: string;
}
