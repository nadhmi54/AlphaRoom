import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CoachHistoryItemDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';

  @IsString() @MaxLength(1500) content!: string;
}

export class AskCoachDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) question!: string;

  /** Absent : la première séance à laquelle la personne participe. */
  @IsOptional() @IsString() @MaxLength(100) sessionId?: string;

  /** Absent : le dernier passage de la séance. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(99) run?: number;

  /** Enseignant uniquement : poser la question « comme » un participant (alias etu_01…). */
  @IsOptional() @IsString() @Matches(/^etu_\d{2,3}$/) alias?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CoachHistoryItemDto)
  history?: CoachHistoryItemDto[];
}
