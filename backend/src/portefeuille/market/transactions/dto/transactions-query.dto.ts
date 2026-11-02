import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class TransactionsQueryDto {
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
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAmount?: number;

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

  @IsOptional()
  @IsIn(['executedAt', 'amount', 'quantity', 'price'])
  sort = 'executedAt';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order: 'ASC' | 'DESC' = 'DESC';
}
