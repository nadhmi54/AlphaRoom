import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Auth } from '../users/auth.decorator.js';
import { CurrentProfile } from '../users/current-profile.decorator.js';
import { MASTER_ROLES } from '../users/user-role.enum.js';
import type { Profile } from '../users/profile.entity.js';
import { GameRoomService } from './services/game-room.service.js';
import { SimulationEngineService } from './services/simulation-engine.service.js';
import { GameRoomAiService } from './services/game-room-ai.service.js';
import { RunSnapshotService } from './services/run-snapshot.service.js';
import {
  ClosePositionDto,
  CreateGameRoomDto,
  CsvPreviewDto,
  GameMasterActionDto,
  JoinGameRoomDto,
  PlaceSimOrderDto,
  RoomControlDto,
  RoomSeekDto,
  RoomSpeedDto,
  UpdateGameRoomConfigDto,
} from './dto/game-room.dto.js';

@Controller('game-room')
export class GameRoomController {
  constructor(
    private readonly roomService: GameRoomService,
    private readonly simEngine: SimulationEngineService,
    private readonly aiService: GameRoomAiService,
    private readonly runSnapshots: RunSnapshotService,
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

  /** Salles créées par le Meneur de Jeu connecté. */
  @Get('mine')
  @Auth(...MASTER_ROLES)
  async getMyRooms(@CurrentProfile() profile: Profile) {
    return { rooms: await this.roomService.getMasterRooms(profile.id) };
  }

  /** Validation et aperçu d'un fichier CSV de bougies, avant création de la salle. */
  @Post('preview-csv')
  @Auth(...MASTER_ROLES)
  previewCsv(@Body() body: CsvPreviewDto) {
    return this.roomService.previewCsv(body.content);
  }

  /** Créer une salle de simulation configurée (Enseignant / Game Master). */
  @Post('create')
  @Auth(...MASTER_ROLES)
  async createRoom(@CurrentProfile() profile: Profile, @Body() body: CreateGameRoomDto) {
    const room = await this.roomService.createRoom(profile.id, body);
    return this.roomService.publicRoomView(room);
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
  async getRoomDetails(
    @CurrentProfile() profile: Profile,
    @Param('roomId') roomId: string,
    @Query('symbol') symbol?: string,
  ) {
    return this.roomService.getRoomDetails(roomId, profile.id, profile.role, symbol);
  }

  /** Bougies OHLC de la salle sur le timeframe demandé. */
  @Get(':roomId/candles')
  @Auth()
  async getCandles(
    @Param('roomId') roomId: string,
    @Query('symbol') symbol?: string,
    @Query('timeframe') timeframe?: string,
  ) {
    return this.roomService.getRoomCandles(roomId, symbol, timeframe);
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
      symbol: body.symbol,
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
    @Body() body: ClosePositionDto,
  ) {
    const room = await this.roomService.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new Error('Salle introuvable');
    return this.simEngine.closePosition(room, profile.id, body.symbol ?? '');
  }

  /** Modifier la configuration d'une salle non lancée (Game Master). */
  @Patch(':roomId/config')
  @Auth(...MASTER_ROLES)
  async updateConfig(
    @CurrentProfile() profile: Profile,
    @Param('roomId') roomId: string,
    @Body() body: UpdateGameRoomConfigDto,
  ) {
    const room = await this.roomService.updateRoomConfig(roomId, profile.id, body);
    return this.roomService.publicRoomView(room);
  }

  /** Contrôle de la séance : Play, Pause, Resume, Reset, Fin (Game Master). */
  @Post(':roomId/control')
  @Auth(...MASTER_ROLES)
  async controlRoom(
    @CurrentProfile() profile: Profile,
    @Param('roomId') roomId: string,
    @Body() body: RoomControlDto,
  ) {
    return this.roomService.controlRoom(roomId, profile.id, body.action);
  }

  /** Vitesse de relecture de la séance (Game Master). */
  @Post(':roomId/speed')
  @Auth(...MASTER_ROLES)
  async setSpeed(
    @CurrentProfile() profile: Profile,
    @Param('roomId') roomId: string,
    @Body() body: RoomSpeedDto,
  ) {
    return this.roomService.setSpeed(roomId, profile.id, body.speed);
  }

  /** Curseur de séance : saut à une seconde de simulation (Game Master). */
  @Post(':roomId/seek')
  @Auth(...MASTER_ROLES)
  async seek(
    @CurrentProfile() profile: Profile,
    @Param('roomId') roomId: string,
    @Body() body: RoomSeekDto,
  ) {
    return this.roomService.seek(roomId, profile.id, body.seconds);
  }

  /** Actions Enseignant / Game Master : chocs de prix, news, spread, liquidité, rollback. */
  @Post(':roomId/action')
  @Auth(...MASTER_ROLES)
  async gameMasterAction(
    @CurrentProfile() profile: Profile,
    @Param('roomId') roomId: string,
    @Body() body: GameMasterActionDto,
  ) {
    const room = await this.roomService.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new Error('Salle introuvable');
    // Le rollback supprime les exécutions postérieures : on garde le passage actuel pour le module IA (replay).
    if (body.type === 'ROLLBACK') await this.runSnapshots.archiveCurrentRun(room);
    return this.simEngine.applyGameMasterAction(room, body);
  }

  /** Tableau de bord de l'enseignant avec classement de tous les participants. */
  @Get(':roomId/dashboard')
  @Auth(...MASTER_ROLES)
  async getDashboard(@CurrentProfile() profile: Profile, @Param('roomId') roomId: string) {
    return this.roomService.getMasterDashboard(roomId, profile.id, profile.role);
  }

  /** IA Market Analyst : Analyse pédagogique du marché actuel. */
  @Get(':roomId/ai/analyst')
  @Auth()
  async getAiMarketAnalysis(@CurrentProfile() profile: Profile, @Param('roomId') roomId: string) {
    return this.aiService.getMarketAnalysis(roomId, profile);
  }

  /** IA Trading Coach : Question-réponse pédagogique individualisée. */
  @Post(':roomId/ai/coach')
  @Auth()
  async askAiCoach(
    @CurrentProfile() profile: Profile,
    @Param('roomId') roomId: string,
    @Body() body: { question: string },
  ) {
    return this.aiService.askTradingCoach(roomId, profile, body.question);
  }

  /** IA Performance Evaluator : Bilan pédagogique et notation de la séance. */
  @Get(':roomId/ai/eval')
  @Auth()
  async getAiEvaluation(@CurrentProfile() profile: Profile, @Param('roomId') roomId: string) {
    return this.aiService.evaluateStudentPerformance(roomId, profile);
  }
}
