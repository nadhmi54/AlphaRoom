import { IsString, IsUUID, MaxLength } from 'class-validator';

export class ClosePositionDto {
  @IsString()
  @MaxLength(20)
  symbol!: string;

  @IsUUID()
  requestId!: string;
}
