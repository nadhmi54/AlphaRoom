import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

/** Séance visée : sans identifiant, la première séance de la personne ; sans passage, le dernier. */
export class GuideTargetDto {
  @IsOptional() @IsString() @MaxLength(100) sessionId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(99) run?: number;

  /** Enseignant uniquement : agir « comme » un participant (alias etu_01…). */
  @IsOptional() @IsString() @Matches(/^etu_\d{2,3}$/) alias?: string;
}

export class GuideAlertsQueryDto extends GuideTargetDto {
  /** Vrai : renvoie aussi les alertes déjà montrées (historique). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  all?: boolean;
}
