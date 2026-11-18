import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import type { Repository } from 'typeorm';
import { AcademyCourse } from './academy-course.entity.js';
import { AcademyLesson } from './academy-lesson.entity.js';
import { AcademyUserUnlock } from '../progress/academy-user-unlock.entity.js';
import { AcademyAccessService } from '../path/academy-access.service.js';
import { isLevelOpen } from '../path/path-logic.js';
import {
  CourseDetailDto,
  CourseSummaryDto,
  LessonDto,
} from './dto/course-response.dto.js';

/**
 * Règle d'accès à un cours, isolée en fonction pure pour être testable sans
 * base : un cours de base (`isPremium = false`) est ouvert à tous, un cours
 * avancé n'est serviable que si le joueur possède un déblocage.
 *
 * Les déblocages sont écrits par le moteur de règles (progression : mission
 * réussie ; récompense : victoire en partie) dans `academy_user_unlocks` : cette
 * fonction ne fait que les relire, elle n'accorde rien elle-même.
 */
export function isCourseUnlocked(
  course: Pick<AcademyCourse, 'id' | 'isPremium'>,
  unlockedCourseIds: ReadonlySet<string>,
): boolean {
  return !course.isPremium || unlockedCourseIds.has(course.id);
}

/**
 * Catalogue et détail des cours. Le contenu avancé d'un cours verrouillé n'est
 * jamais renvoyé : la restriction est appliquée côté serveur, pas seulement
 * masquée dans l'interface.
 */
@Injectable()
export class AcademyContentService {
  constructor(
    @InjectRepository(AcademyCourse)
    private readonly courses: Repository<AcademyCourse>,
    @InjectRepository(AcademyLesson)
    private readonly lessons: Repository<AcademyLesson>,
    @InjectRepository(AcademyUserUnlock)
    private readonly unlocks: Repository<AcademyUserUnlock>,
    private readonly access: AcademyAccessService,
  ) {}

  /** Catalogue complet, cours verrouillés inclus, avec la condition affichable. */
  async listCatalog(userId: string): Promise<CourseSummaryDto[]> {
    const [courses, unlocked, currentLevel] = await Promise.all([
      this.courses.find({ order: { level: 'ASC', position: 'ASC', title: 'ASC' } }),
      this.unlockedCourseIds(userId),
      this.access.getCurrentLevel(userId),
    ]);
    return courses.map((course) =>
      plainToInstance(CourseSummaryDto, {
        ...course,
        unlocked:
          isCourseUnlocked(course, unlocked) && isLevelOpen(course.level, currentLevel),
      }),
    );
  }

  /**
   * Détail d'un cours : refusé si le cours est verrouillé pour ce joueur, que
   * ce soit par son contenu avancé (`isPremium`) ou par son niveau (un cours de
   * niveau supérieur reste inaccessible tant que la mission précédente n'est
   * pas réussie).
   */
  async getCourse(courseId: string, userId: string): Promise<CourseDetailDto> {
    const course = await this.courses.findOne({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Cours introuvable.');

    const [unlocked, currentLevel] = await Promise.all([
      this.unlockedCourseIds(userId),
      this.access.getCurrentLevel(userId),
    ]);
    if (!isCourseUnlocked(course, unlocked) || !isLevelOpen(course.level, currentLevel)) {
      throw new ForbiddenException(
        course.unlockHint
          ? `Ce cours est verrouillé : ${course.unlockHint}`
          : 'Ce cours est verrouillé.',
      );
    }

    const lessons = await this.lessons.find({
      where: { courseId: course.id },
      order: { position: 'ASC' },
    });
    return plainToInstance(CourseDetailDto, {
      ...course,
      unlocked: true,
      lessons: lessons.map((lesson) => plainToInstance(LessonDto, lesson)),
    });
  }

  /** Identifiants des cours débloqués pour un joueur (les badges sont ignorés). */
  private async unlockedCourseIds(userId: string): Promise<Set<string>> {
    const rows = await this.unlocks.find({ where: { userId } });
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.courseId) ids.add(row.courseId);
    }
    return ids;
  }
}
