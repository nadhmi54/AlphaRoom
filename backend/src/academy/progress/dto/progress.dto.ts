import { Expose, Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Mise à jour de la progression d'un élève sur une leçon. `not_started` n'est
 * pas accepté : on ne « dé-progresse » pas, on avance ou on recommence.
 * `score` porte le résultat d'un quiz rattaché à la leçon, quand il y en a un.
 */
export class UpdateLessonProgressDto {
  @IsIn(['in_progress', 'completed'], {
    message: 'Statut invalide (in_progress ou completed).',
  })
  status!: 'in_progress' | 'completed';

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Le score doit être un nombre à 2 décimales.' })
  @Min(0)
  @Max(100)
  score?: number;
}

/** Avancement d'un élève sur une compétence (une compétence = un cours). */
export class SkillProgressDto {
  @Expose() courseId!: string;
  @Expose() code!: string;
  @Expose() title!: string;
  @Expose() level!: number;
  @Expose() unlocked!: boolean;
  @Expose() completedLessons!: number;
  @Expose() totalLessons!: number;
  @Expose() percent!: number;
}

/** Vue « ma progression » : XP, niveau et avancement par compétence. */
export class MyProgressDto {
  @Expose() userId!: string;
  @Expose() xp!: number;
  @Expose() level!: number;
  @Expose() nextLevelXp!: number;
  @Expose() xpToNextLevel!: number;
  @Expose() completedLessons!: number;
  @Expose() totalLessons!: number;
  @Expose() percentCompleted!: number;

  @Expose()
  @Type(() => SkillProgressDto)
  skills!: SkillProgressDto[];
}
