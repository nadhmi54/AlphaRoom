import { Expose, Type } from 'class-transformer';
import type { MissionCriteria } from '../../missions/mission-criteria.js';

/** Cours d'un niveau, réduit à ce qui est nécessaire pour afficher l'avancement. */
export class PathCourseDto {
  @Expose() id!: string;
  @Expose() code!: string;
  @Expose() title!: string;
  @Expose() position!: number;
  @Expose() validated!: boolean;
}

/**
 * Mission d'un niveau vue par le joueur : son état (`locked`, `available`,
 * `passed`) et, quand elle est verrouillée, la condition pour la débloquer.
 * Aucun contenu caché ne transite : seuls les critères, déjà publics.
 */
export class PathMissionDto {
  @Expose() id!: string;
  @Expose() code!: string;
  @Expose() title!: string;
  @Expose() description!: string | null;
  @Expose() criteria!: MissionCriteria;
  @Expose() state!: 'locked' | 'available' | 'passed';
  @Expose() unlockCondition!: string;
}

/** Badge de niveau, avec son état d'obtention pour le joueur. */
export class PathBadgeDto {
  @Expose() code!: string;
  @Expose() title!: string;
  @Expose() icon!: string | null;
  @Expose() awarded!: boolean;
}

/** Un palier du parcours : ses cours, sa mission, son badge. */
export class PathLevelDto {
  @Expose() level!: number;
  @Expose() open!: boolean;
  @Expose() coursesValidated!: number;
  @Expose() coursesTotal!: number;
  @Expose() badge!: PathBadgeDto | null;

  @Expose()
  @Type(() => PathCourseDto)
  courses!: PathCourseDto[];

  @Expose()
  @Type(() => PathMissionDto)
  mission!: PathMissionDto | null;
}

/** Vue complète du parcours par niveau d'un joueur. */
export class PathDto {
  @Expose() userId!: string;
  @Expose() currentLevel!: number;

  @Expose()
  @Type(() => PathLevelDto)
  levels!: PathLevelDto[];
}
