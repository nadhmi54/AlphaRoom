import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MARKET_ASSETS } from '../../trading/market-assets.js';

const SYMBOLS = MARKET_ASSETS.map((asset) => asset.symbol);

export class BookQueryDto {
  @IsString()
  @IsIn(SYMBOLS)
  symbol!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  depth?: number;
}
