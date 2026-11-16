import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CoachHistoryItemDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';

  @IsString() @MaxLength(8000) content!: string;
}

export class RenameConversationDto {
  @IsString() @IsNotEmpty() @MaxLength(120) title!: string;
}

export class AskCoachDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) question!: string;

  /**
   * Discussion à poursuivre : le serveur relit lui-même son historique (le champ `history` est alors ignoré).
   * Absent : une nouvelle discussion est créée et son identifiant est renvoyé.
   */
  @IsOptional() @IsUUID() conversationId?: string;

  /** Absent : la première séance à laquelle la personne participe. */
  @IsOptional() @IsString() @MaxLength(100) sessionId?: string;

  /** Absent : le dernier passage de la séance. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(99) run?: number;

  /** Enseignant uniquement : poser la question « comme » un participant (alias etu_01…). */
  @IsOptional() @IsString() @Matches(/^etu_\d{2,3}$/) alias?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => CoachHistoryItemDto)
  history?: CoachHistoryItemDto[];
}
