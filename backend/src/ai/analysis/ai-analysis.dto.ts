import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

export class MarketAnalysisDto {
  @IsString() @IsNotEmpty() @MaxLength(100) sessionId!: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(99) run!: number;
}

export class ReplayAnalysisDto {
  @IsString() @IsNotEmpty() @MaxLength(100) sessionId!: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(99) fromRun!: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(99) toRun!: number;
}
