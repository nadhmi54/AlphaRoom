import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Profile } from '../../users/profile.entity.js';
import { AiGameRoomService } from '../../ai/game-room/ai-game-room.service.js';

/**
 * Les trois « rôles IA » de la Game Room (Market Analyst, Trading Coach,
 * Performance Evaluator) sont fournis par le module IA : même chiffres que les
 * bilans de l'enseignant, réponses contrôlées, aucun conseil d'achat ou de
 * vente. Ce service ne garde que le point d'entrée des routes existantes.
 *
 * Le module IA est résolu au moment de l'appel (et non injecté) pour que
 * `GameRoomModule` n'importe jamais `AiModule` : lui-même lit la Game Room.
 */
@Injectable()
export class GameRoomAiService {
  constructor(private readonly moduleRef: ModuleRef) {}

  private get ai(): AiGameRoomService {
    return this.moduleRef.get(AiGameRoomService, { strict: false });
  }

  getMarketAnalysis(roomId: string, profile: Profile) {
    return this.ai.analyst(profile, roomId);
  }

  askTradingCoach(roomId: string, profile: Profile, question: string) {
    return this.ai.askCoach(profile, roomId, question);
  }

  evaluateStudentPerformance(roomId: string, profile: Profile) {
    return this.ai.evaluation(profile, roomId);
  }
}
