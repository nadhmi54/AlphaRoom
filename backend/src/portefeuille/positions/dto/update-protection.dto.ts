import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateProtectionDto {
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
