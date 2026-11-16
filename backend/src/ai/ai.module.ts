import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameRoomModule } from '../game-room/game-room.module.js';
import { AiGameRoomService } from './game-room/ai-game-room.service.js';
import { GameRoomSessionProvider } from './game-room/game-room-session.provider.js';
import { AiAnalysisController } from './analysis/ai-analysis.controller.js';
import { AiAnalysisService } from './analysis/ai-analysis.service.js';
import { MarketAnalysisService } from './market/market-analysis.service.js';
import { MarketHistoryService } from './market/history.js';
import { AiConversationsController } from './coach/ai-conversations.controller.js';
import { AiConversationsService } from './coach/ai-conversations.service.js';
import { AiConversation } from './storage/ai-conversation.entity.js';
import { AiConversationMessage } from './storage/ai-conversation-message.entity.js';
import { AgentMemory } from './agent/agent-memory.js';
import { AiGuideController } from './agent/ai-guide.controller.js';
import { AiGuideService } from './agent/ai-guide.service.js';
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
 *   - "demo" : séance fictive « mardi-panique » (démonstration, sans simulation) ;
 *   - "game-room" : les vraies salles de la Game Room (identifiant de séance = identifiant de salle).
 */
export function createSessionDataProvider(
  source: string | undefined,
  demoStudentId?: string,
  gameRoomProvider?: () => SessionDataProvider,
): SessionDataProvider {
  if (source === 'demo') return createDemoProvider(demoStudentId || undefined);
  if (source === 'game-room' && gameRoomProvider) return new DeferredSessionDataProvider(gameRoomProvider);
  return new UnconfiguredSessionDataProvider();
}

/**
 * Résout le fournisseur à l'appel et non au démarrage : `AiCoreModule` reste
 * sans base de données, le fournisseur de la Game Room vit dans `AiModule`.
 */
class DeferredSessionDataProvider implements SessionDataProvider {
  constructor(private readonly resolve: () => SessionDataProvider) {}

  getSession(sessionId: string, run: number) {
    return this.resolve().getSession(sessionId, run);
  }

  listSessions() {
    const provider = this.resolve();
    return provider.listSessions ? provider.listSessions() : Promise.resolve([]);
  }
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
      inject: [ConfigService, ModuleRef],
      useFactory: (config: ConfigService, moduleRef: ModuleRef) =>
        createSessionDataProvider(config.get<string>('AI_SESSION_SOURCE'), config.get<string>('AI_DEMO_STUDENT_ID'), () =>
          moduleRef.get(GameRoomSessionProvider, { strict: false }),
        ),
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
  imports: [AiCoreModule, GameRoomModule, TypeOrmModule.forFeature([AiReport, AiReportRevision, AiUsage, AiConversation, AiConversationMessage])],
  controllers: [AiReportsController, AiCoachController, AiConversationsController, AiGuideController, AiAnalysisController, AiSessionsController],
  providers: [AiReportsService, AiCoachService, AiGuideService, { provide: AgentMemory, useFactory: () => new AgentMemory() }, AiAnalysisService, AiGameRoomService, GameRoomSessionProvider, MarketHistoryService, MarketAnalysisService, AiConversationsService],
  exports: [AiReportsService, AiGameRoomService, AiCoreModule],
})
export class AiModule {}
