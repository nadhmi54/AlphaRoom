import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { Auth } from '../users/auth.decorator.js';
import { CurrentProfile } from '../users/current-profile.decorator.js';
import type { Profile } from '../users/profile.entity.js';
import { GameRoomService } from './services/game-room.service.js';
import { SimulationEngineService } from './services/simulation-engine.service.js';
import { GameRoomAiService } from './services/game-room-ai.service.js';
import {
  CreateGameRoomDto,
  GameMasterActionDto,
  JoinGameRoomDto,
  PlaceSimOrderDto,
  RoomControlDto,
} from './dto/game-room.dto.js';

@Controller('game-room')
export class GameRoomController {
  constructor(
    private readonly roomService: GameRoomService,
    private readonly simEngine: SimulationEngineService,
    private readonly aiService: GameRoomAiService,
  ) {}

  /** Salle de démonstration "Le mardi de la panique" accessible immédiatement. */
  @Get('demo')
  @Auth()
  async getDemoRoom(@CurrentProfile() profile: Profile) {
    const isMaster = profile.role === 'game_master' || profile.role === 'admin';
    const demo = await this.roomService.getOrCreateDemoRoom(isMaster ? profile.id : undefined);
    // Seuls les étudiants s'enregistrent comme participants dans la salle
    if (!isMaster) {
      await this.roomService.joinRoom(demo.id, profile.id, profile.fullName || 'Étudiant');
    }
    return this.roomService.getRoomDetails(demo.id, profile.id, profile.role);
  }

  /** Créer une nouvelle salle de simulation (Enseignant). */
  @Post('create')
  @Auth()
  async createRoom(@CurrentProfile() profile: Profile, @Body() body: CreateGameRoomDto) {
    return this.roomService.createRoom(profile.id, body.name, body.scenarioId);
  }

  /** Rejoindre une salle avec son joinCode (ex: "PANIC1"). */
  @Post('join')
  @Auth()
  async joinRoom(@CurrentProfile() profile: Profile, @Body() body: JoinGameRoomDto) {
    return this.roomService.joinRoom(
      body.codeOrId,
      profile.id,
      body.nickname || profile.fullName || 'Étudiant',
    );
  }

  /** Obtenir les informations et l'état en direct d'une salle (cours, temps, carnet, participants). */
  @Get(':roomId')
  @Auth()
  async getRoomDetails(@CurrentProfile() profile: Profile, @Param('roomId') roomId: string) {
    return this.roomService.getRoomDetails(roomId, profile.id, profile.role);
  }

  /** Obtenir le portefeuille virtuel de simulation de l'étudiant. */
  @Get(':roomId/portfolio')
  @Auth()
  async getStudentPortfolio(@CurrentProfile() profile: Profile, @Param('roomId') roomId: string) {
    return this.roomService.getStudentPortfolio(roomId, profile.id);
  }

  /** Passer un ordre dans la Game Room (Market ou Limit, Stop-Loss, Take-Profit). */
  @Post(':roomId/order')
  @Auth()
  async placeOrder(
    @CurrentProfile() profile: Profile,
    @Param('roomId') roomId: string,
    @Body() body: PlaceSimOrderDto,
  ) {
    const room = await this.roomService.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new Error('Salle introuvable');

    return this.simEngine.placeSimulationOrder({
      room,
      userId: profile.id,
      symbol: body.symbol || 'XAU/USD',
      side: body.side,
      type: body.type,
      quantity: body.quantity,
      limitPrice: body.limitPrice,
      stopLoss: body.stopLoss,
      takeProfit: body.takeProfit,
    });
  }

  /** Clôturer immédiatement une position ouverte sur un actif. */
  @Post(':roomId/close-position')
  @Auth()
  async closePosition(
    @CurrentProfile() profile: Profile,
    @Param('roomId') roomId: string,
    @Body() body: { symbol: string },
  ) {
    const room = await this.roomService.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new Error('Salle introuvable');
    return this.simEngine.closePosition(room, profile.id, body.symbol || 'XAU/USD');
  }

  /** Contrôle de la séance : Play, Pause, Resume, Reset (Game Master). */
  @Post(':roomId/control')
  @Auth()
  async controlRoom(
    @CurrentProfile() profile: Profile,
    @Param('roomId') roomId: string,
    @Body() body: RoomControlDto,
  ) {
    if (profile.role !== 'game_master' && profile.role !== 'admin') {
      throw new ForbiddenException('Réservé au Meneur de Jeu');
    }
    return this.roomService.controlRoom(roomId, profile.id, body.action);
  }

  /** Actions Enseignant / Game Master : Chocs de prix, news, spread, liquidité, rollback. */
  @Post(':roomId/action')
  @Auth()
  async gameMasterAction(
    @CurrentProfile() profile: Profile,
    @Param('roomId') roomId: string,
    @Body() body: GameMasterActionDto,
  ) {
    if (profile.role !== 'game_master' && profile.role !== 'admin') {
      throw new ForbiddenException('Réservé au Meneur de Jeu');
    }
    const room = await this.roomService.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new Error('Salle introuvable');
    return this.simEngine.applyGameMasterAction(room, body);
  }

  /** Tableau de bord de l'enseignant avec classement de tous les participants. */
  @Get(':roomId/dashboard')
  @Auth()
  async getDashboard(@CurrentProfile() profile: Profile, @Param('roomId') roomId: string) {
    if (profile.role !== 'game_master' && profile.role !== 'admin') {
      return { room: null, market: null, leaderboard: [], isMaster: false };
    }
    return this.roomService.getMasterDashboard(roomId, profile.id, profile.role);
  }

  /** IA Market Analyst : Analyse pédagogique du marché actuel. */
  @Get(':roomId/ai/analyst')
  @Auth()
  async getAiMarketAnalysis(@CurrentProfile() profile: Profile, @Param('roomId') roomId: string) {
    return this.aiService.getMarketAnalysis(roomId, profile.id);
  }

  /** IA Trading Coach : Question-réponse pédagogique individualisée. */
  @Post(':roomId/ai/coach')
  @Auth()
  async askAiCoach(
    @CurrentProfile() profile: Profile,
    @Param('roomId') roomId: string,
    @Body() body: { question: string },
  ) {
    return this.aiService.askTradingCoach(roomId, profile.id, body.question);
  }

  /** IA Performance Evaluator : Bilan pédagogique et notation de la séance. */
  @Get(':roomId/ai/eval')
  @Auth()
  async getAiEvaluation(@CurrentProfile() profile: Profile, @Param('roomId') roomId: string) {
    return this.aiService.evaluateStudentPerformance(roomId, profile.id);
  }
}
