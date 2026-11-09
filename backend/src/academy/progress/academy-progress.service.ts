import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import type { Repository } from 'typeorm';
import { AcademyCourse } from '../content/academy-course.entity.js';
import { AcademyLesson } from '../content/academy-lesson.entity.js';
import { isCourseUnlocked } from '../content/academy-content.service.js';
import { AcademyAccessService } from '../path/academy-access.service.js';
import { isLevelOpen } from '../path/path-logic.js';
import { AcademyUserProgress } from './academy-user-progress.entity.js';
import { AcademyUserStats } from './academy-user-stats.entity.js';
import { AcademyUserUnlock } from './academy-user-unlock.entity.js';
import {
  MyProgressDto,
  SkillProgressDto,
  type UpdateLessonProgressDto,
} from './dto/progress.dto.js';

/** XP nécessaire pour franchir un palier de niveau. */
export const XP_PER_LEVEL = 100;

/**
 * Niveau atteint pour un total d'XP donné. Règle pure et monotone : le palier
 * `n` commence à `(n − 1) × XP_PER_LEVEL`, donc le niveau est
 * `1 + floor(xp / XP_PER_LEVEL)`. Isolée pour être vérifiable sans base.
 */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  return 1 + Math.floor(xp / XP_PER_LEVEL);
}

/** XP cumulé nécessaire pour atteindre un niveau donné (`xpForLevel(1) = 0`). */
export function xpForLevel(level: number): number {
  const safeLevel = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  return (safeLevel - 1) * XP_PER_LEVEL;
}

/**
 * Progression pédagogique : avancement par compétence (une compétence = un
 * cours), XP et niveau. Les lectures ne modifient rien en base ; `addXp` est
 * réservé au moteur de règles qui, lui, décide des récompenses.
 */
@Injectable()
export class AcademyProgressService {
  constructor(
    @InjectRepository(AcademyCourse)
    private readonly courses: Repository<AcademyCourse>,
    @InjectRepository(AcademyLesson)
    private readonly lessons: Repository<AcademyLesson>,
    @InjectRepository(AcademyUserProgress)
    private readonly progress: Repository<AcademyUserProgress>,
    @InjectRepository(AcademyUserStats)
    private readonly stats: Repository<AcademyUserStats>,
    @InjectRepository(AcademyUserUnlock)
    private readonly unlocks: Repository<AcademyUserUnlock>,
    private readonly access: AcademyAccessService,
  ) {}

  /** Vue complète de la progression d'un joueur (lecture seule). */
  async getMyProgress(userId: string): Promise<MyProgressDto> {
    const [stats, courses, lessons, rows, unlocked, currentLevel] = await Promise.all([
      this.stats.findOne({ where: { userId } }),
      this.courses.find({ order: { level: 'ASC', position: 'ASC', title: 'ASC' } }),
      this.lessons.find({ order: { position: 'ASC' } }),
      this.progress.find({ where: { userId } }),
      this.unlockedCourseIds(userId),
      this.access.getCurrentLevel(userId),
    ]);

    const xp = stats?.xp ?? 0;
    const level = levelForXp(xp);

    const completedByLesson = new Set(
      rows.filter((row) => row.status === 'completed').map((row) => row.lessonId),
    );
    const lessonsByCourse = new Map<string, AcademyLesson[]>();
    for (const lesson of lessons) {
      const list = lessonsByCourse.get(lesson.courseId);
      if (list) list.push(lesson);
      else lessonsByCourse.set(lesson.courseId, [lesson]);
    }

    const skills: SkillProgressDto[] = courses.map((course) => {
      const courseLessons = lessonsByCourse.get(course.id) ?? [];
      const completed = courseLessons.filter((lesson) => completedByLesson.has(lesson.id)).length;
      return plainToInstance(SkillProgressDto, {
        courseId: course.id,
        code: course.code,
        title: course.title,
        level: course.level,
        unlocked: isCourseUnlocked(course, unlocked) && isLevelOpen(course.level, currentLevel),
        completedLessons: completed,
        totalLessons: courseLessons.length,
        percent: courseLessons.length === 0 ? 0 : Math.round((completed / courseLessons.length) * 100),
      });
    });

    const totalLessons = skills.reduce((sum, skill) => sum + skill.totalLessons, 0);
    const completedLessons = skills.reduce((sum, skill) => sum + skill.completedLessons, 0);
    const nextLevelXp = xpForLevel(level + 1);

    return plainToInstance(MyProgressDto, {
      userId,
      xp,
      level,
      nextLevelXp,
      xpToNextLevel: Math.max(0, nextLevelXp - xp),
      completedLessons,
      totalLessons,
      percentCompleted: totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100),
      skills,
    });
  }

  /**
   * Enregistre l'avancement d'un élève sur une leçon (création ou mise à jour).
   * La leçon doit appartenir à un cours débloqué : on ne progresse pas sur du
   * contenu verrouillé.
   */
  async updateLessonProgress(
    userId: string,
    lessonId: string,
    dto: UpdateLessonProgressDto,
  ): Promise<void> {
    const lesson = await this.lessons.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Leçon introuvable.');

    const course = await this.courses.findOne({ where: { id: lesson.courseId } });
    if (!course) throw new NotFoundException('Cours introuvable.');

    const [unlocked, currentLevel] = await Promise.all([
      this.unlockedCourseIds(userId),
      this.access.getCurrentLevel(userId),
    ]);
    if (!isCourseUnlocked(course, unlocked) || !isLevelOpen(course.level, currentLevel)) {
      throw new ForbiddenException('Ce cours est verrouillé.');
    }

    let row = await this.progress.findOne({ where: { userId, lessonId } });
    if (!row) {
      row = this.progress.create({
        userId,
        courseId: lesson.courseId,
        lessonId,
        status: 'not_started',
      });
    }
    row.status = dto.status;
    if (dto.score !== undefined) row.score = dto.score.toFixed(2);
    if (dto.status === 'completed' && !row.completedAt) row.completedAt = new Date();
    await this.progress.save(row);
  }

  /**
   * Ajoute de l'XP à un joueur et recalcule son niveau. Utilisé par le moteur
   * de règles (récompenses) : ce n'est pas une route publique, l'XP ne
   * s'attribue jamais à la demande du client.
   */
  async addXp(userId: string, amount: number): Promise<AcademyUserStats> {
    const delta = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
    let stats = await this.stats.findOne({ where: { userId } });
    if (!stats) stats = this.stats.create({ userId, xp: 0, level: 1 });
    stats.xp += delta;
    stats.level = levelForXp(stats.xp);
    return this.stats.save(stats);
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
