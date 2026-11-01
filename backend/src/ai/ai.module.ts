import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiAnalysisController } from './analysis/ai-analysis.controller.js';
import { AiAnalysisService } from './analysis/ai-analysis.service.js';
import { AiCoachController } from './coach/ai-coach.controller.js';
import { AiCoachService } from './coach/ai-coach.service.js';
import { AiReportsController } from './ai-reports.controller.js';
import { AiSessionsController } from './sessions/ai-sessions.controller.js';
import {
  SESSION_DATA_PROVIDER,
  UnconfiguredSessionDataProvider,
  type SessionDataProvider,
} from './contract/session-data-provider.js';
import { createDemoProvider } from './demo/demo-provider.js';
import { createLlmProvider } from './llm/create-llm-provider.js';
import { LLM_PROVIDER } from './llm/llm-provider.js';
import { AiReport } from './storage/ai-report.entity.js';
import { AiReportRevision } from './storage/ai-report-revision.entity.js';
import { AiReportsService } from './storage/ai-reports.service.js';
import { AiUsage } from './storage/ai-usage.entity.js';

/**
 * Source des données de séance selon `AI_SESSION_SOURCE` :
 *   - absent / "none" : la simulation n'est pas branchée → erreur 503 claire ;
 *   - "demo" : séance fictive « mardi-panique » (démonstration, sans simulation).
 * Quand la simulation existera, elle fournira son propre SessionDataProvider.
 */
export function createSessionDataProvider(source: string | undefined, demoStudentId?: string): SessionDataProvider {
  if (source === 'demo') return createDemoProvider(demoStudentId || undefined);
  return new UnconfiguredSessionDataProvider();
}

/** Fournisseurs sans base de données : modèle de langage et source des séances. */
@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createLlmProvider({
          provider: config.get<string>('AI_PROVIDER'),
          apiKey: config.get<string>('AI_API_KEY') || config.get<string>('ANTHROPIC_API_KEY'),
          baseUrl: config.get<string>('AI_BASE_URL'),
          model: config.get<string>('AI_MODEL'),
        }),
    },
    {
      provide: SESSION_DATA_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createSessionDataProvider(config.get<string>('AI_SESSION_SOURCE'), config.get<string>('AI_DEMO_STUDENT_ID')),
    },
  ],
  exports: [LLM_PROVIDER, SESSION_DATA_PROVIDER],
})
export class AiCoreModule {}

/**
 * Module IA d'AlphaRoom (salle de simulation pédagogique) :
 *   - bilans individuels (génération, correction, validation, publication) ;
 *   - Trading Coach (questions de l'étudiant sur ses propres données) ;
 *   - analyses enseignant : marché (Market Analyst) et replay (Replay Analyzer).
 */
@Module({
  imports: [AiCoreModule, TypeOrmModule.forFeature([AiReport, AiReportRevision, AiUsage])],
  controllers: [AiReportsController, AiCoachController, AiAnalysisController, AiSessionsController],
  providers: [AiReportsService, AiCoachService, AiAnalysisService],
  exports: [AiReportsService, AiCoreModule],
})
export class AiModule {}
