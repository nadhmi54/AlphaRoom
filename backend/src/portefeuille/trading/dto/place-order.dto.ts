import { IsIn, IsNumber, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class PlaceOrderDto {
  @IsString()
  @MaxLength(20)
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
