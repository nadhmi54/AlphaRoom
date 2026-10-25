import { IsIn, IsOptional, IsString } from 'class-validator';
import { MARKET_ASSETS } from '../../trading/market-assets.js';
import { HISTORY_RANGES, type HistoryRange } from '../market-feed-config.js';

export class HistoryQueryDto {
  @IsString()
  @IsIn(MARKET_ASSETS.map((asset) => asset.symbol))
  symbol!: string;

  @IsOptional()
  @IsIn(Object.keys(HISTORY_RANGES))
  range: HistoryRange = '5m';
}
