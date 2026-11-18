import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import type { Repository } from 'typeorm';
import { AcademyQuizAttempt } from '../content/academy-quiz-attempt.entity.js';
import { AcademyBadgeService } from '../badges/academy-badge.service.js';
import { AcademyQuizCatalogService } from '../content/academy-quiz-catalog.service.js';
import { AcademyQuizService } from '../content/academy-quiz.service.js';
import type { QuizDto } from '../content/dto/quiz.dto.js';
import { AcademyAccessService, type LevelInfo } from './academy-access.service.js';
import { pickQuiz, levelBadgeCode, missionUnlockCondition } from './path-logic.js';
import { PathDto } from './dto/path.dto.js';

/**
 * Parcours par niveau et tirage des quiz de cours.
 *
 * Le tirage est fait exclusivement ici, côté serveur : le joueur ne choisit
 * jamais le quiz. On exclut le dernier quiz tenté (s'il en existe d'autres),
 * pour ne pas retomber systématiquement sur le même. La vue du parcours ne fait
 * que résumer l'état calculé par `AcademyAccessService` (cours validés, état des
 * missions) : aucune réussite n'est décidée ici.
 */
@Injectable()
export class AcademyPathService {
  constructor(
    private readonly access: AcademyAccessService,
    private readonly badges: AcademyBadgeService,
    private readonly catalog: AcademyQuizCatalogService,
    private readonly quizzes: AcademyQuizService,
    @InjectRepository(AcademyQuizAttempt)
    private readonly attempts: Repository<AcademyQuizAttempt>,
  ) {}

  /** Parcours complet d'un joueur : niveaux, cours validés, missions et badges. */
  async getPath(userId: string): Promise<PathDto> {
    const access = await this.access.getAccess(userId);
    const [catalog, mine] = await Promise.all([
      this.badges.listBadges(),
      this.badges.getMyBadges(userId),
    ]);
    const badgeByCode = new Map(catalog.map((badge) => [badge.code, badge]));
    const ownedCodes = new Set(mine.map((badge) => badge.code));

    const levels = access.levels.map((level) => this.toLevelDto(level, badgeByCode, ownedCodes));

    return plainToInstance(PathDto, {
      userId,
      currentLevel: access.currentLevel,
      levels,
    });
  }

  /**
   * Tire un quiz du cours pour un passage. Le cours doit être accessible (même
   * règle que le catalogue) : `listCourseQuizzes` refuse un cours verrouillé, et
   * `getQuiz` re-vérifie l'accès pour construire la version sans réponses.
   */
  async drawCourseQuiz(courseId: string, userId: string): Promise<QuizDto> {
    const summaries = await this.catalog.listCourseQuizzes(courseId, userId);
    if (summaries.length === 0) {
      throw new NotFoundException('Aucun quiz n’est rattaché à ce cours.');
    }

    const last = await this.attempts.findOne({
      where: { userId, courseId },
      order: { createdAt: 'DESC' },
    });
    const picked = pickQuiz(
      summaries.map((summary) => summary.id),
      last?.quizId ?? null,
    );
    if (!picked) throw new NotFoundException('Aucun quiz n’est rattaché à ce cours.');
    return this.quizzes.getQuiz(picked, userId);
  }

  private toLevelDto(
    level: LevelInfo,
    badgeByCode: Map<string, { code: string; title: string; icon: string | null }>,
    ownedCodes: Set<string>,
  ) {
    const badgeCode = levelBadgeCode(level.level);
    const badge = badgeByCode.get(badgeCode);
    return {
      level: level.level,
      open: level.open,
      coursesValidated: level.coursesValidated,
      coursesTotal: level.coursesTotal,
      courses: level.courses,
      badge: badge
        ? {
            code: badge.code,
            title: badge.title,
            icon: badge.icon,
            awarded: ownedCodes.has(badge.code),
          }
        : null,
      mission: level.mission
        ? {
            id: level.mission.id,
            code: level.mission.code,
            title: level.mission.title,
            description: level.mission.description,
            criteria: level.mission.criteria,
            state: level.mission.state,
            unlockCondition: missionUnlockCondition(level.mission.state, level.level),
          }
        : null,
    };
  }
}
