import { IsNumber, IsOptional, Min } from 'class-validator';

export class MarketMakerConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  spreadBps?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  volatility?: number;

  @IsOptional()
  @IsNumber()
  inventory?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxInventory?: number;
}
