import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameRoomModule } from '../game-room/game-room.module.js';
import { PerformanceModule } from '../portefeuille/performance/performance.module.js';
import { AcademyCourse } from './content/academy-course.entity.js';
import { AcademyLesson } from './content/academy-lesson.entity.js';
import { AcademyQuiz } from './content/academy-quiz.entity.js';
import { AcademyQuizQuestion } from './content/academy-quiz-question.entity.js';
import { AcademyQuizAttempt } from './content/academy-quiz-attempt.entity.js';
import { AcademyMission } from './missions/academy-mission.entity.js';
import { AcademyPack } from './rewards/academy-pack.entity.js';
import { AcademyPackItem } from './rewards/academy-pack-item.entity.js';
import { AcademyBadge } from './badges/academy-badge.entity.js';
import { AcademyUserBadge } from './badges/academy-user-badge.entity.js';
import { AcademyUserProgress } from './progress/academy-user-progress.entity.js';
import { AcademyUserUnlock } from './progress/academy-user-unlock.entity.js';
import { AcademyUserStats } from './progress/academy-user-stats.entity.js';
import { AcademyUnlockRule } from './rules/academy-unlock-rule.entity.js';
import { AcademyRuleApplication } from './rules/academy-rule-application.entity.js';
import { AcademyGameResult } from './results/academy-game-result.entity.js';
import { AcademyContentController } from './content/academy-content.controller.js';
import { AcademyContentService } from './content/academy-content.service.js';
import { AcademyQuizController } from './content/academy-quiz.controller.js';
import { AcademyQuizService } from './content/academy-quiz.service.js';
import { AcademyQuizCatalogController } from './content/academy-quiz-catalog.controller.js';
import { AcademyQuizCatalogService } from './content/academy-quiz-catalog.service.js';
import { AcademyProgressController } from './progress/academy-progress.controller.js';
import { AcademyProgressService } from './progress/academy-progress.service.js';
import { AcademyMissionController } from './missions/academy-mission.controller.js';
import { AcademyMissionService } from './missions/academy-mission.service.js';
import { AcademyRulesService } from './rules/academy-rules.service.js';
import { AcademyBadgeController } from './badges/academy-badge.controller.js';
import { AcademyBadgeService } from './badges/academy-badge.service.js';
import { AcademyAdminController } from './admin/academy-admin.controller.js';
import { AcademyAdminService } from './admin/academy-admin.service.js';
import { AcademyResultsService } from './results/academy-results.service.js';
import { AcademyIngestScheduler } from './results/academy-ingest.scheduler.js';
import { AcademySimulationController } from './results/academy-simulation.controller.js';
import { AcademyAccessService } from './path/academy-access.service.js';
import { AcademyPathService } from './path/academy-path.service.js';
import { AcademyPathController } from './path/academy-path.controller.js';

/**
 * Module agrégateur du module Academy (Formation, Pédagogie & Engagement).
 * Seul point d'entrée importé dans app.module.ts. Les contrôleurs, services,
 * moteur de règles et adaptateur de résultats sont ajoutés au fil des tâches.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AcademyCourse,
      AcademyLesson,
      AcademyQuiz,
      AcademyQuizQuestion,
      AcademyQuizAttempt,
      AcademyMission,
      AcademyPack,
      AcademyPackItem,
      AcademyBadge,
      AcademyUserBadge,
      AcademyUserProgress,
      AcademyUserUnlock,
      AcademyUserStats,
      AcademyUnlockRule,
      AcademyRuleApplication,
      AcademyGameResult,
    ]),
    GameRoomModule,
    PerformanceModule,
  ],
  controllers: [
    AcademyContentController,
    AcademyQuizController,
    AcademyQuizCatalogController,
    AcademyProgressController,
    AcademyMissionController,
    AcademyBadgeController,
    AcademySimulationController,
    AcademyAdminController,
    AcademyPathController,
  ],
  providers: [
    AcademyAccessService,
    AcademyPathService,
    AcademyContentService,
    AcademyQuizService,
    AcademyQuizCatalogService,
    AcademyProgressService,
    AcademyMissionService,
    AcademyRulesService,
    AcademyBadgeService,
    AcademyResultsService,
    AcademyIngestScheduler,
    AcademyAdminService,
  ],
  exports: [
    AcademyAccessService,
    AcademyPathService,
    AcademyContentService,
    AcademyQuizService,
    AcademyQuizCatalogService,
    AcademyProgressService,
    AcademyMissionService,
    AcademyRulesService,
    AcademyBadgeService,
    AcademyResultsService,
  ],
})
export class AcademyModule {}
