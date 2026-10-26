import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { MARKET_ASSETS } from '../../trading/market-assets.js';

export class UpdateProtectionDto {
  @IsString()
  @IsIn(MARKET_ASSETS.map((asset) => asset.symbol))
  symbol!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(10000000)
  stopLoss?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(10000000)
  takeProfit?: number | null;
}
