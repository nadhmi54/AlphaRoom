import { IsIn, IsString, IsUUID } from 'class-validator';
import { MARKET_ASSETS } from '../../trading/market-assets.js';

export class ClosePositionDto {
  @IsString()
  @IsIn(MARKET_ASSETS.map((asset) => asset.symbol))
  symbol!: string;

  @IsUUID()
  requestId!: string;
}
