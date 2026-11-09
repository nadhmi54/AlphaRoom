import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import type { AcademyEventType } from '../../rules/academy-events.js';

/**
 * Indicateurs d'une partie simulée. Réservé aux tests hors production : en
 * fonctionnement réel, ces chiffres sont toujours calculés côté serveur à
 * partir des résultats enregistrés, jamais reçus du navigateur.
 */
export class SimulationMetricsDto {
  @IsOptional() @IsNumber() returnPercent?: number;
  @IsOptional() @IsNumber() maxDrawdown?: number;
  @IsOptional() @IsNumber() sharpe?: number;
  @IsOptional() @IsInt() @Min(0) ordersCount?: number;
  @IsOptional() @IsInt() @Min(0) assetsCount?: number;
  @IsOptional() @IsInt() @Min(0) durationSeconds?: number;
}

/** Événement interne simulé, pour tester tout le parcours sans Game Room. */
export class SimulationEventDto {
  @IsIn(['game_finished', 'quiz_passed', 'challenge_won', 'streak_days'], {
    message: 'Type d’événement inconnu.',
  })
  type!: AcademyEventType;

  @IsOptional() @IsUUID('4') userId?: string;
  @IsOptional() @IsUUID('4') roomId?: string;
  @IsOptional() @IsUUID('4') missionId?: string;
  @IsOptional() @IsString() scenarioId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SimulationMetricsDto)
  metrics?: SimulationMetricsDto;

  @IsOptional() @IsObject() payload?: Record<string, unknown>;
}
