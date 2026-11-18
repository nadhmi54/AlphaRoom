import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { AcademyCourse } from '../content/academy-course.entity.js';
import { AcademyQuizAttempt } from '../content/academy-quiz-attempt.entity.js';
import { AcademyMission } from '../missions/academy-mission.entity.js';
import type { MissionCriteria, MissionMetrics } from '../missions/mission-criteria.js';
import { evaluateMission } from '../missions/mission-criteria.js';
import { AcademyGameResult } from '../results/academy-game-result.entity.js';
import { computeCurrentLevel, type MissionState } from './path-logic.js';

export type { MissionState };

export interface LevelCourseInfo {
  id: string;
  code: string;
  title: string;
  position: number;
  validated: boolean;
}

export interface LevelMissionInfo {
  id: string;
  code: string;
  title: string;
  description: string | null;
  criteria: MissionCriteria;
  isPlacement: boolean;
  state: MissionState;
}

export interface LevelInfo {
  level: number;
  open: boolean;
  courses: LevelCourseInfo[];
  coursesValidated: number;
  coursesTotal: number;
  mission: LevelMissionInfo | null;
}

/** Vue consolidée du parcours d'un joueur, calculée à partir des données réelles. */
export interface PlayerAccess {
  userId: string;
  currentLevel: number;
  validatedCourseIds: Set<string>;
  levels: LevelInfo[];
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toMetrics(result: AcademyGameResult): MissionMetrics {
  return {
    returnPercent: toNumber(result.returnPercent),
    maxDrawdown: toNumber(result.maxDrawdown),
    sharpe: toNumber(result.sharpe),
    ordersCount: toNumber(result.ordersCount),
    durationSeconds: toNumber(result.durationSeconds),
  };
}

/**
 * Calcule l'avancement d'un joueur dans le parcours par niveau, à partir des
 * seules données enregistrées : cours validés (tentatives de quiz réussies),
 * missions réussies (résultats de parties satisfaisant leurs critères).
 *
 * Aucun contenu verrouillé ne transite par ce service : il ne renvoie que des
 * états (ouvert/verrouillé, validé/…). Les services de contenu s'appuient sur
 * `getCurrentLevel` pour refuser réellement le contenu d'un niveau verrouillé.
 */
@Injectable()
export class AcademyAccessService {
  constructor(
    @InjectRepository(AcademyCourse)
    private readonly courses: Repository<AcademyCourse>,
    @InjectRepository(AcademyMission)
    private readonly missions: Repository<AcademyMission>,
    @InjectRepository(AcademyQuizAttempt)
    private readonly attempts: Repository<AcademyQuizAttempt>,
    @InjectRepository(AcademyGameResult)
    private readonly results: Repository<AcademyGameResult>,
  ) {}

  /** Niveau courant du joueur (voir `computeCurrentLevel`). */
  async getCurrentLevel(userId: string): Promise<number> {
    const access = await this.getAccess(userId);
    return access.currentLevel;
  }

  /** Vue complète du parcours, triée par niveau croissant. */
  async getAccess(userId: string): Promise<PlayerAccess> {
    const [courses, missions, attempts, results] = await Promise.all([
      this.courses.find({ order: { level: 'ASC', position: 'ASC', title: 'ASC' } }),
      this.missions.find({ where: { isActive: true }, order: { level: 'ASC', position: 'ASC' } }),
      this.attempts.find({ where: { userId, passed: true } }),
      this.results.find({ where: { userId } }),
    ]);

    const validatedCourseIds = new Set(attempts.map((attempt) => attempt.courseId));
    const metrics = results.map(toMetrics);

    const coursesByLevel = new Map<number, AcademyCourse[]>();
    for (const course of courses) {
      const list = coursesByLevel.get(course.level);
      if (list) list.push(course);
      else coursesByLevel.set(course.level, [course]);
    }

    const missionByLevel = new Map<number, AcademyMission>();
    for (const mission of missions) {
      if (!missionByLevel.has(mission.level)) missionByLevel.set(mission.level, mission);
    }

    const levelNumbers = [...new Set([...coursesByLevel.keys(), ...missionByLevel.keys()])].sort(
      (a, b) => a - b,
    );

    const passedLevels = new Set<number>();
    const levels: LevelInfo[] = levelNumbers.map((level) => {
      const levelCourses = coursesByLevel.get(level) ?? [];
      const courseInfos: LevelCourseInfo[] = levelCourses.map((course) => ({
        id: course.id,
        code: course.code,
        title: course.title,
        position: course.position,
        validated: validatedCourseIds.has(course.id),
      }));
      const coursesValidated = courseInfos.filter((course) => course.validated).length;
      const allValidated = courseInfos.length === 0 || coursesValidated === courseInfos.length;

      const mission = missionByLevel.get(level) ?? null;
      let missionInfo: LevelMissionInfo | null = null;
      if (mission) {
        const criteria = mission.criteria as MissionCriteria;
        const passed =
          allValidated && metrics.some((metric) => evaluateMission(criteria, metric).passed);
        if (passed) passedLevels.add(level);
        missionInfo = {
          id: mission.id,
          code: mission.code,
          title: mission.title,
          description: mission.description,
          criteria,
          isPlacement: mission.isPlacement,
          state: passed ? 'passed' : allValidated ? 'available' : 'locked',
        };
      }

      return {
        level,
        open: false,
        courses: courseInfos,
        coursesValidated,
        coursesTotal: courseInfos.length,
        mission: missionInfo,
      };
    });

    const currentLevel = computeCurrentLevel(passedLevels);
    for (const levelInfo of levels) {
      levelInfo.open = levelInfo.level <= currentLevel;
    }

    return { userId, currentLevel, validatedCourseIds, levels };
  }
}
