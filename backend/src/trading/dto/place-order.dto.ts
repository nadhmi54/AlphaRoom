import { IsIn, IsNumber, IsString, IsUUID, Max, Min } from 'class-validator';

export class PlaceOrderDto {
  @IsString()
  @IsIn(['XAU/USD', 'EUR/USD', 'BTC/USD', 'AAPL'])
  symbol!: string;

  @IsString()
  @IsIn(['buy', 'sell'])
  side!: 'buy' | 'sell';

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(1000000)
  quantity!: number;

  @IsUUID()
  requestId!: string;
}
