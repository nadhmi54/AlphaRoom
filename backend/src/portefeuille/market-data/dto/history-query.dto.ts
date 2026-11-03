import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { HISTORY_RANGES, type HistoryRange } from '../market-feed-config.js';

export class HistoryQueryDto {
  /** Symbole de l'actif à historiser (n'importe quel symbole accepté). */
  @IsString()
  @MaxLength(20)
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
