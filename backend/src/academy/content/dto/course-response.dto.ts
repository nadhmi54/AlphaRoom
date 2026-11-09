import { Expose, Type } from 'class-transformer';

/**
 * Une leçon du catalogue. `content` et `videoUrl` ne sont renvoyés que dans le
 * détail d'un cours déverrouillé : la liste ne doit pas divulguer la matière
 * d'un cours verrouillé.
 */
export class LessonDto {
  @Expose() id!: string;
  @Expose() code!: string | null;
  @Expose() title!: string;
  @Expose() kind!: 'text' | 'video' | 'link';
  @Expose() content!: string | null;
  @Expose() videoUrl!: string | null;
  @Expose() durationMinutes!: number;
  @Expose() position!: number;
}

/**
 * Un cours tel qu'il apparaît dans le catalogue. Un cours verrouillé est
 * renvoyé comme les autres (titre, sommaire, `unlockHint`) mais `unlocked` vaut
 * `false` : l'élève voit toujours la condition de déblocage.
 */
export class CourseSummaryDto {
  @Expose() id!: string;
  @Expose() code!: string;
  @Expose() title!: string;
  @Expose() summary!: string | null;
  @Expose() level!: number;
  @Expose() isPremium!: boolean;
  @Expose() unlockHint!: string | null;
  @Expose() position!: number;
  @Expose() unlocked!: boolean;
}

/** Détail d'un cours déverrouillé : résumé + sommaire des leçons. */
export class CourseDetailDto extends CourseSummaryDto {
  @Expose()
  @Type(() => LessonDto)
  lessons!: LessonDto[];
}
