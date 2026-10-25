import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class PortfolioHistoryQueryDto {
  @IsOptional()
  @IsIn(['XAU/USD', 'EUR/USD', 'BTC/USD', 'AAPL'])
  symbol?: string;

  @IsOptional()
  @IsIn(['buy', 'sell'])
  side?: 'buy' | 'sell';

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
