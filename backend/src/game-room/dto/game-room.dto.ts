import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateGameRoomDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  scenarioId?: string;
}

export class JoinGameRoomDto {
  @IsString()
  @IsNotEmpty()
  codeOrId!: string;

  @IsString()
  @IsOptional()
  nickname?: string;
}

export class PlaceSimOrderDto {
  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @IsString()
  side!: 'buy' | 'sell';

  @IsString()
  type!: 'market' | 'limit';

  @IsNumber()
  @Min(0.000001)
  quantity!: number;

  @IsNumber()
  @IsOptional()
  limitPrice?: number;

  @IsNumber()
  @IsOptional()
  stopLoss?: number;

  @IsNumber()
  @IsOptional()
  takeProfit?: number;
}

export class GameMasterActionDto {
  @IsString()
  @IsNotEmpty()
  type!: 'PRICE_SHOCK' | 'VOLATILITY_SHOCK' | 'SPREAD_SHOCK' | 'LIQUIDITY_SHOCK' | 'NEWS' | 'WHALE' | 'ROLLBACK';

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  payload?: Record<string, any>;
}

export class RoomControlDto {
  @IsString()
  @IsNotEmpty()
  action!: 'start' | 'pause' | 'resume' | 'reset';
}
