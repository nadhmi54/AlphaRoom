import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameRoom, GameRoomStatus } from '../entities/game-room.entity.js';
import { GameParticipant } from '../entities/game-participant.entity.js';
import { SimulationPortfolio } from '../entities/sim-portfolio.entity.js';
import { SimulationPosition } from '../entities/sim-position.entity.js';
import { SimulationOrder } from '../entities/sim-order.entity.js';
import { SimulationTrade } from '../entities/sim-trade.entity.js';
import { GameEvent } from '../entities/game-event.entity.js';
import { Profile } from '../../users/profile.entity.js';
import { UserRole } from '../../users/user-role.enum.js';
import { SimulationEngineService, applyFill, readRoomConfig } from './simulation-engine.service.js';
import {
  MarketSourceService,
  csvSpanSeconds,
  type MarketState,
} from './market-source.service.js';
import { parseCandlesCsv } from '../csv-parser.js';
import { PANIC_TUESDAY_SCENARIO } from '../scenario/panic-tuesday.scenario.js';
import {
  HISTORY_RANGE_SECONDS,
  resolveTimeModel,
  type CsvCandle,
  type MarketSourceConfig,
} from '../game-room-config.js';
import type { CreateGameRoomDto, MarketSourceDto, UpdateGameRoomConfigDto } from '../dto/game-room.dto.js';

const DEMO_JOIN_CODE = 'PANIC1';
const MAX_JOIN_CODE_ATTEMPTS = 12;

@Injectable()
export class GameRoomService {
  private readonly logger = new Logger(GameRoomService.name);

  constructor(
    @InjectRepository(GameRoom) public readonly rooms: Repository<GameRoom>,
    @InjectRepository(GameParticipant) public readonly participants: Repository<GameParticipant>,
    @InjectRepository(SimulationPortfolio) public readonly portfolios: Repository<SimulationPortfolio>,
    @InjectRepository(SimulationPosition) public readonly positions: Repository<SimulationPosition>,
    @InjectRepository(SimulationOrder) public readonly orders: Repository<SimulationOrder>,
    @InjectRepository(SimulationTrade) public readonly trades: Repository<SimulationTrade>,
    @InjectRepository(GameEvent) public readonly events: Repository<GameEvent>,
    @InjectRepository(Profile) public readonly profilesRepo: Repository<Profile>,
    private readonly simEngine: SimulationEngineService,
    private readonly marketSource: MarketSourceService,
  ) {}

  /** Génère un code court de salle ex: "GOLD30", "PANIC7" */
  private generateJoinCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private async uniqueJoinCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt++) {
      const code = this.generateJoinCode();
      const existing = await this.rooms.findOne({ where: { joinCode: code } });
      if (!existing) return code;
    }
    throw new BadRequestException('Impossible de générer un code de salle disponible. Réessayez.');
  }

  /**
   * Créer ou récupérer la salle de démonstration "Le mardi de la panique".
   * Repérée par son code fixe pour ne jamais capturer une salle créée par un enseignant.
   */
  async getOrCreateDemoRoom(preferredMasterId?: string): Promise<GameRoom> {
    let demo = await this.rooms.findOne({ where: { joinCode: DEMO_JOIN_CODE } });
    if (!demo) {
      let masterId = preferredMasterId;
      if (!masterId) {
        const gm = await this.profilesRepo.findOne({ where: { role: UserRole.GAME_MASTER } });
        masterId = gm?.id;
      }
      if (!masterId) {
        throw new BadRequestException(
          'Aucun meneur de jeu enregistré : la salle de démonstration ne peut pas être créée.',
        );
      }
      demo = await this.createRoom(masterId, {
        name: 'Le mardi de la panique — Séance principale',
        scenarioId: 'panic_tuesday',
      });
      demo.joinCode = DEMO_JOIN_CODE;
      demo = await this.rooms.save(demo);
    }
    return demo;
  }

  /** Salles créées par un Meneur de Jeu, avec leur état et leur audience. */
  async getMasterRooms(masterId: string) {
    const rooms = await this.rooms.find({
      where: { masterId },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(
      rooms.map(async (room) => {
        const counts = await this.participants.count({ where: { roomId: room.id } });
        const market = await this.marketSource.getMarketState(room);
        return {
          id: room.id,
          name: room.name,
          description: room.description ?? null,
          joinCode: room.joinCode,
          status: room.status,
          sourceMode: room.sourceMode,
          assets: this.marketSource.roomSymbols(room),
          durationMinutes: Number(room.durationMinutes),
          playbackSpeed: Number(room.playbackSpeed),
          totalSimSeconds: Number(room.totalSimSeconds),
          initialCapital: Number(room.initialCapital),
          currency: room.currency,
          participantsCount: counts,
          maxParticipants: Number(room.maxParticipants),
          currentPrice: market.price,
          createdAt: room.createdAt,
        };
      }),
    );
  }

  /**
   * Création d'une Game Room par un enseignant : applique et persiste toute la
   * configuration (salle, source de marché, temps, risque) avant le lancement.
   */
  async createRoom(masterId: string, input: CreateGameRoomDto): Promise<GameRoom> {
    if (!masterId) {
      throw new BadRequestException('Compte meneur de jeu introuvable.');
    }
    const profile = await this.profilesRepo.findOne({ where: { id: masterId } });
    if (!profile) {
      throw new BadRequestException('Profil du meneur de jeu introuvable.');
    }

    const settings = input.config ?? {};
    const source = input.source ?? { mode: 'scenario' as const };
    const time = input.time ?? {};

    const sourceMode = source.mode ?? 'scenario';
    const assets = settings.assets && settings.assets.length > 0 ? [...settings.assets] : ['XAU/USD'];
    const primarySymbol = source.symbol && assets.includes(source.symbol) ? source.symbol : assets[0];

    const sourceConfig: MarketSourceConfig = {
      ...(source.symbol ? { symbol: source.symbol } : {}),
      ...(source.initialPrice ? { initialPrice: source.initialPrice } : {}),
      ...(source.volatilityPercent !== undefined ? { volatilityPercent: source.volatilityPercent } : {}),
      ...(source.trendPercent !== undefined ? { trendPercent: source.trendPercent } : {}),
      ...(source.seed !== undefined ? { seed: source.seed } : {}),
      ...(source.events?.length ? { events: source.events } : {}),
      ...(source.historyRange ? { historyRange: source.historyRange } : {}),
    };
    const candles = this.resolveCsvCandles(source);
    if (candles?.length) sourceConfig.candles = candles;

    if (sourceMode === 'csv' && (sourceConfig.candles?.length ?? 0) < 2) {
      throw new BadRequestException(
        'Le mode CSV exige au moins deux bougies valides. Importez et validez votre fichier avant de créer la salle.',
      );
    }

    const durationMinutes = time.durationMinutes ?? PANIC_TUESDAY_SCENARIO.durationMinutes;
    const datasetSeconds = await this.measureDatasetSeconds(sourceMode, sourceConfig, primarySymbol);
    const timeModel = resolveTimeModel({
      sourceMode,
      sourceConfig,
      durationMinutes,
      timeframe: time.timeframe,
      playbackSpeed: time.playbackSpeed,
      historyStart: time.startAt ?? null,
      historyEnd: time.endAt ?? null,
      datasetSeconds,
    });

    if (timeModel.historyEndAt && timeModel.historyStartAt && timeModel.historyEndAt <= timeModel.historyStartAt) {
      throw new BadRequestException('La fin de la fenêtre historique doit suivre son début.');
    }

    const room = this.rooms.create({
      name: (input.name || PANIC_TUESDAY_SCENARIO.name).trim(),
      description: settings.description?.trim() || null,
      joinCode: await this.uniqueJoinCode(),
      masterId,
      scenarioId: input.scenarioId ?? (sourceMode === 'scenario' ? 'panic_tuesday' : sourceMode),
      status: 'waiting' as GameRoomStatus,
      assets,
      maxParticipants: settings.maxParticipants ?? 30,
      initialCapital: (settings.initialCapital ?? PANIC_TUESDAY_SCENARIO.initialCash).toFixed(2),
      currency: settings.currency ?? 'USD',
      spreadMultiplier: String(settings.spreadMultiplier ?? 1),
      commissionPercent: String(settings.commissionPercent ?? 0),
      leverage: String(settings.leverage ?? 1),
      allowShortSelling: Boolean(settings.allowShortSelling),
      maxExposure: settings.maxExposure ? settings.maxExposure.toFixed(2) : null,
      riskLimitPercent: settings.riskLimitPercent ? settings.riskLimitPercent.toFixed(2) : null,
      sourceMode: sourceMode as GameRoom['sourceMode'],
      sourceConfig,
      durationMinutes: timeModel.durationMinutes,
      timeframe: timeModel.timeframe,
      playbackSpeed: String(timeModel.playbackSpeed),
      totalSimSeconds: timeModel.totalSimSeconds,
      historyStartAt: timeModel.historyStartAt,
      historyEndAt: timeModel.historyEndAt,
      simElapsedSeconds: 0,
    });

    const saved = await this.rooms.save(room);
    this.logger.log(
      `Salle ${saved.joinCode} créée par ${masterId} : source=${saved.sourceMode}, ` +
        `${saved.totalSimSeconds}s de simulation en ${saved.durationMinutes} min (x${saved.playbackSpeed}).`,
    );
    return saved;
  }

  /**
   * Le CSV brut, s'il est fourni, est revalidé côté serveur et prime sur les
   * bougies déjà transmises (l'aperçu n'en renvoie qu'un extrait).
   */
  private resolveCsvCandles(source: MarketSourceDto): CsvCandle[] | undefined {
    if (!source.csvContent) return source.candles;
    const parsed = parseCandlesCsv(source.csvContent);
    if (parsed.candles.length < 2) {
      const first = parsed.issues[0]?.message ?? 'aucune bougie valide détectée';
      throw new BadRequestException(`Fichier CSV invalide : ${first}. Corrigez-le puis relancez l’import.`);
    }
    return parsed.candles;
  }

  /** Durée réelle des données à rejouer, pour en déduire la vitesse de lecture. */
  private async measureDatasetSeconds(    sourceMode: string,
    sourceConfig: MarketSourceConfig,
    symbol: string,
  ): Promise<number | null> {
    if (sourceMode === 'csv') return csvSpanSeconds(sourceConfig.candles);
    if (sourceMode === 'historical') {
      const range = sourceConfig.historyRange ?? '24h';
      const span = await this.marketSource.measureHistoricalSpan(symbol, range);
      return span ?? HISTORY_RANGE_SECONDS[range] ?? null;
    }
    return null;
  }

  /**
   * Mise à jour de la configuration d'une salle non lancée.
   * Les règles d'une séance en cours ne changent jamais en pleine partie.
   */
  async updateRoomConfig(roomId: string, masterId: string, input: UpdateGameRoomConfigDto): Promise<GameRoom> {
    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Salle introuvable.');
    if (room.masterId !== masterId) {
      throw new ForbiddenException('Seul le créateur de la salle peut modifier sa configuration.');
    }
    if (room.status !== 'waiting') {
      throw new BadRequestException(
        'La configuration ne peut être modifiée que avant le lancement de la séance (statut « en attente »).',
      );
    }

    if (input.name) room.name = input.name.trim();
    const settings = input.config ?? {};
    if (settings.description !== undefined) room.description = settings.description?.trim() || null;
    if (settings.assets?.length) room.assets = [...settings.assets];
    if (settings.maxParticipants) room.maxParticipants = settings.maxParticipants;
    if (settings.initialCapital) room.initialCapital = settings.initialCapital.toFixed(2);
    if (settings.currency) room.currency = settings.currency;
    if (settings.spreadMultiplier !== undefined) room.spreadMultiplier = String(settings.spreadMultiplier);
    if (settings.commissionPercent !== undefined) room.commissionPercent = String(settings.commissionPercent);
    if (settings.leverage !== undefined) room.leverage = String(settings.leverage);
    if (settings.allowShortSelling !== undefined) room.allowShortSelling = settings.allowShortSelling;
    if (settings.maxExposure !== undefined) {
      room.maxExposure = settings.maxExposure ? settings.maxExposure.toFixed(2) : null;
    }
    if (settings.riskLimitPercent !== undefined) {
      room.riskLimitPercent = settings.riskLimitPercent ? settings.riskLimitPercent.toFixed(2) : null;
    }

    const source = input.source;
    if (source) {
      const candles = this.resolveCsvCandles(source);
      room.sourceMode = source.mode ?? room.sourceMode;
      room.sourceConfig = {
        ...room.sourceConfig,
        ...(source.symbol !== undefined ? { symbol: source.symbol } : {}),
        ...(source.initialPrice !== undefined ? { initialPrice: source.initialPrice } : {}),
        ...(source.volatilityPercent !== undefined ? { volatilityPercent: source.volatilityPercent } : {}),
        ...(source.trendPercent !== undefined ? { trendPercent: source.trendPercent } : {}),
        ...(source.seed !== undefined ? { seed: source.seed } : {}),
        ...(source.events !== undefined ? { events: source.events } : {}),
        ...(source.historyRange !== undefined ? { historyRange: source.historyRange } : {}),
        ...(candles !== undefined ? { candles } : {}),
      };
      if (room.sourceMode !== 'csv') {
        delete room.sourceConfig.candles;
      } else if ((room.sourceConfig.candles?.length ?? 0) < 2) {
        throw new BadRequestException('Le mode CSV exige au moins deux bougies valides.');
      }
      this.marketSource.invalidateDataset(room.id);
    }

    const time = input.time ?? {};
    const datasetSeconds = await this.measureDatasetSeconds(
      room.sourceMode,
      room.sourceConfig ?? {},
      this.marketSource.primarySymbol(room),
    );
    const timeModel = resolveTimeModel({
      sourceMode: room.sourceMode,
      sourceConfig: room.sourceConfig ?? {},
      durationMinutes: time.durationMinutes ?? Number(room.durationMinutes),
      timeframe: time.timeframe ?? room.timeframe,
      playbackSpeed: time.playbackSpeed ?? Number(room.playbackSpeed),
      historyStart: time.startAt ?? room.historyStartAt,
      historyEnd: time.endAt ?? room.historyEndAt,
      datasetSeconds,
    });
    room.durationMinutes = timeModel.durationMinutes;
    room.timeframe = timeModel.timeframe;
    room.playbackSpeed = String(timeModel.playbackSpeed);
    room.totalSimSeconds = timeModel.totalSimSeconds;
    room.historyStartAt = timeModel.historyStartAt;
    room.historyEndAt = timeModel.historyEndAt;
    room.simElapsedSeconds = Math.min(room.simElapsedSeconds, room.totalSimSeconds);

    return this.rooms.save(room);
  }

  /**
   * Rejoindre une salle avec son code ou son ID.
   */
  async joinRoom(codeOrId: string, userId: string, nickname: string) {
    const room = await this.rooms.findOne({
      where: [{ joinCode: codeOrId.toUpperCase() }, { id: codeOrId }],
    });
    if (!room) {
      throw new NotFoundException('Salle de simulation introuvable avec ce code.');
    }

    let participant = await this.participants.findOne({ where: { roomId: room.id, userId } });
    if (!participant) {
      const current = await this.participants.count({ where: { roomId: room.id } });
      if (current >= Number(room.maxParticipants ?? 30)) {
        throw new BadRequestException(
          `Salle complète : ${current} participants sur ${room.maxParticipants} maximum.`,
        );
      }
      participant = this.participants.create({
        roomId: room.id,
        userId,
        nickname: nickname || `Étudiant-${userId.slice(0, 4)}`,
        isActive: true,
      });
      await this.participants.save(participant);
    }

    const portfolio = await this.ensurePortfolio(room, userId);
    return { room: this.publicRoomView(room), participant, portfolio };
  }

  /** Portefeuille virtuel de la salle, doté du capital initial configuré. */
  private async ensurePortfolio(room: GameRoom, userId: string): Promise<SimulationPortfolio> {
    const capital = Number(room.initialCapital ?? 100000);
    let portfolio = await this.portfolios.findOne({ where: { roomId: room.id, userId } });
    if (!portfolio) {
      portfolio = this.portfolios.create({
        roomId: room.id,
        userId,
        cash: capital.toFixed(2),
        initialCash: capital.toFixed(2),
      });
      portfolio = await this.portfolios.save(portfolio);
    }
    return portfolio;
  }

  /** Vue de la salle envoyée aux participants (sans les bougies CSV, trop lourdes). */
  publicRoomView(room: GameRoom): Record<string, any> {
    const config = readRoomConfig(room);
    const candles = room.sourceConfig?.candles?.length ?? 0;
    return {
      id: room.id,
      name: room.name,
      description: room.description ?? null,
      joinCode: room.joinCode,
      status: room.status,
      scenarioId: room.scenarioId,
      masterId: room.masterId,
      assets: this.marketSource.roomSymbols(room),
      maxParticipants: Number(room.maxParticipants),
      initialCapital: config.initialCapital,
      currency: room.currency,
      spreadMultiplier: config.spreadMultiplier,
      commissionPercent: config.commissionPercent,
      leverage: config.leverage,
      allowShortSelling: config.allowShortSelling,
      maxExposure: config.maxExposure,
      riskLimitPercent: config.riskLimitPercent,
      sourceMode: room.sourceMode,
      sourceConfig: { ...room.sourceConfig, candles: undefined, candlesCount: candles },
      durationMinutes: Number(room.durationMinutes),
      timeframe: room.timeframe,
      playbackSpeed: Number(room.playbackSpeed),
      totalSimSeconds: Number(room.totalSimSeconds),
      historyStartAt: room.historyStartAt ? new Date(room.historyStartAt).toISOString() : null,
      historyEndAt: room.historyEndAt ? new Date(room.historyEndAt).toISOString() : null,
      simElapsedSeconds: this.marketSource.calculateCurrentElapsedSeconds(room),
      createdAt: room.createdAt,
    };
  }

  /**
   * Détails d'une salle : statut, temps, prix de chaque actif, carnet, participants.
   * Toutes les valeurs proviennent du serveur : les participants d'une même salle
   * voient exactement le même marché au même instant de simulation.
   */
  async getRoomDetails(roomId: string, userId: string, userRole = 'trader', symbol?: string) {
    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Salle introuvable.');

    if (room.status === 'running') {
      await this.simEngine.checkTriggeredOrdersAndProtections(room);
    }

    const activeSymbol = symbol ?? this.marketSource.primarySymbol(room);
    const marketStates = await this.marketSource.getMarketStates(room);
    const marketState =
      marketStates.find((state) => state.symbol === activeSymbol) ?? marketStates[0];

    const studentParticipants = await this.studentParticipantsOf(room);
    const book = await this.simEngine.getOrderBook(room, marketState.symbol);
    const series = await this.marketSource.buildSeries(room, marketState.symbol, marketState.elapsedSeconds);
    const recentEvents = await this.events.find({
      where: { roomId: room.id },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const isMaster = userRole === UserRole.GAME_MASTER || userRole === UserRole.ADMIN;
    const timeView = this.timeView(room, marketState);

    return {
      room: {
        ...timeView,
        id: room.id,
        name: room.name,
        description: room.description ?? null,
        joinCode: room.joinCode,
        status: room.status,
        scenarioId: room.scenarioId,
        scenarioName: room.sourceMode === 'scenario' ? PANIC_TUESDAY_SCENARIO.name : room.name,
        assets: this.marketSource.roomSymbols(room),
        activeSymbol: marketState.symbol,
        sourceMode: room.sourceMode,
        currency: room.currency,
        initialCapital: Number(room.initialCapital),
        maxParticipants: Number(room.maxParticipants),
        spreadMultiplier: Number(room.spreadMultiplier),
        commissionPercent: Number(room.commissionPercent),
        leverage: Number(room.leverage),
        allowShortSelling: room.allowShortSelling,
        maxExposure: room.maxExposure === null ? null : Number(room.maxExposure),
        riskLimitPercent: room.riskLimitPercent === null ? null : Number(room.riskLimitPercent),
        isMaster,
        userRole,
      },
      market: {
        symbol: marketState.symbol,
        price: marketState.price,
        spread: marketState.spread,
        source: marketState.source,
        timestamp: marketState.timestamp,
        series,
        symbols: marketStates.map((state) => ({
          symbol: state.symbol,
          price: state.price,
          spread: state.spread,
          source: state.source,
          timestamp: state.timestamp,
        })),
      },
      book,
      participantsCount: studentParticipants.length,
      participants: isMaster
        ? studentParticipants.map((p) => ({
            id: p.id,
            userId: p.userId,
            nickname: p.nickname,
            isActive: p.isActive,
          }))
        : [],
      recentEvents,
    };
  }

  /** Bougies OHLC du timeframe choisi, pour le graphique de la salle. */
  async getRoomCandles(roomId: string, symbol?: string, timeframe?: string) {
    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Salle introuvable.');
    const active = this.marketSource.roomSymbols(room).includes(symbol ?? '')
      ? (symbol as string)
      : this.marketSource.primarySymbol(room);
    const elapsed = this.marketSource.calculateCurrentElapsedSeconds(room);
    const candles = await this.marketSource.buildCandles(room, active, elapsed, timeframe ?? room.timeframe);
    return {
      symbol: active,
      timeframe: timeframe ?? room.timeframe,
      elapsedSeconds: elapsed,
      candles,
    };
  }

  /** Vue temps de la séance : position du curseur, fenêtre historique, vitesse. */
  private timeView(room: GameRoom, market: MarketState): RoomTimeView {
    const total = market.totalSeconds;
    return {
      simElapsedSeconds: market.elapsedSeconds,
      totalSimSeconds: total,
      currentMinute: market.currentMinute,
      totalMinutes: Math.round((total / 60) * 10) / 10,
      durationMinutes: Number(room.durationMinutes),
      timeframe: room.timeframe,
      playbackSpeed: Number(room.playbackSpeed),
      progressPercent: total > 0 ? Math.round((market.elapsedSeconds / total) * 1000) / 10 : 0,
      marketTimestamp: market.timestamp,
      historyStartAt: room.historyStartAt ? new Date(room.historyStartAt).toISOString() : null,
      historyEndAt: room.historyEndAt ? new Date(room.historyEndAt).toISOString() : null,
      remainingRealSeconds: Math.max(
        0,
        Math.round((total - market.elapsedSeconds) / Math.max(Number(room.playbackSpeed) || 1, 0.0001)),
      ),
    };
  }

  /**
   * Portefeuille virtuel de l'étudiant dans la Game Room.
   * Totalement isolé de tout autre portefeuille ou du module /marche.
   */
  async getStudentPortfolio(roomId: string, userId: string) {
    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Salle introuvable.');

    const portfolio = await this.ensurePortfolio(room, userId);
    const marketStates = await this.marketSource.getMarketStates(room);
    const priceOf = (symbol: string) =>
      marketStates.find((state) => state.symbol === symbol)?.price ?? marketStates[0]?.price ?? 0;

    const positions = await this.positions.find({ where: { portfolioId: portfolio.id } });
    const trades = await this.trades.find({
      where: { portfolioId: portfolio.id },
      order: { executedAt: 'DESC' },
    });

    let positionsMarketValue = 0;
    let totalUnrealizedPnl = 0;
    let exposure = 0;

    const positionViews = positions.map((pos) => {
      const qty = Number(pos.quantity);
      const avgPrice = Number(pos.averagePrice);
      const currentPrice = priceOf(pos.symbol);
      const mktVal = qty * currentPrice;
      // Une position courte a une valeur de marché négative et un P&L inversé.
      const unrlz = qty > 0 ? qty * (currentPrice - avgPrice) : Math.abs(qty) * (avgPrice - currentPrice);

      positionsMarketValue += mktVal;
      totalUnrealizedPnl += unrlz;
      exposure += Math.abs(qty) * currentPrice;

      return {
        id: pos.id,
        symbol: pos.symbol,
        quantity: qty,
        side: qty < 0 ? 'short' : 'long',
        averagePrice: avgPrice,
        currentPrice,
        marketValue: Math.round(mktVal * 100) / 100,
        unrealizedPnl: Math.round(unrlz * 100) / 100,
        stopLoss: pos.stopLoss ? Number(pos.stopLoss) : null,
        takeProfit: pos.takeProfit ? Number(pos.takeProfit) : null,
      };
    });

    const cash = Number(portfolio.cash);
    const initialCash = Number(portfolio.initialCash);
    const config = readRoomConfig(room);
    const totalValue = Math.round((cash + positionsMarketValue) * 100) / 100;
    const returnAmount = Math.round((totalValue - initialCash) * 100) / 100;
    const returnPercent = initialCash > 0 ? Math.round((returnAmount / initialCash) * 10000) / 100 : 0;

    // P&L réalisé : les trades sont rejoués dans le modèle de marge de la salle.
    const sortedTrades = [...trades].sort(
      (a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime(),
    );
    const replay = new Map<string, { qty: number; avg: number }>();
    let realizedPnl = 0;
    for (const t of sortedTrades) {
      const entry = replay.get(t.symbol) ?? { qty: 0, avg: 0 };
      const fill = applyFill({
        side: t.side,
        quantity: Number(t.quantity),
        price: Number(t.price),
        commissionPercent: 0,
        leverage: config.leverage,
        held: entry.qty,
        averagePrice: entry.avg,
        cash: 0,
      });
      realizedPnl += fill.realizedPnl;
      entry.qty = fill.quantity;
      entry.avg = fill.averagePrice;
      replay.set(t.symbol, entry);
    }

    return {
      portfolio: {
        id: portfolio.id,
        cash,
        initialCash,
        currency: room.currency,
        positionsMarketValue: Math.round(positionsMarketValue * 100) / 100,
        totalValue,
        exposure: Math.round(exposure * 100) / 100,
        maxExposure: config.maxExposure,
        leverage: config.leverage,
        commissionPercent: config.commissionPercent,
        allowShortSelling: config.allowShortSelling,
        riskLimitPercent: config.riskLimitPercent,
        realizedPnl: Math.round(realizedPnl * 100) / 100,
        unrealizedPnl: Math.round(totalUnrealizedPnl * 100) / 100,
        returnAmount,
        returnPercent,
      },
      positions: positionViews.filter((p) => Math.abs(p.quantity) > 1e-9),
      trades: trades.map((t) => ({
        id: t.id,
        symbol: t.symbol,
        side: t.side,
        quantity: Number(t.quantity),
        price: Number(t.price),
        amount: Number(t.amount),
        simMinute: Number(t.simMinute),
        executedAt: t.executedAt,
      })),
    };
  }

  /**
   * Vue Enseignant / Game Master : tableau de bord de tous les étudiants de la salle.
   */
  async getMasterDashboard(roomId: string, userId: string, userRole = 'trader') {
    if (userRole !== UserRole.GAME_MASTER && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Accès au tableau de bord réservé au Meneur de Jeu');
    }

    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Salle introuvable.');

    const studentParticipants = await this.studentParticipantsOf(room);
    const marketStates = await this.marketSource.getMarketStates(room);
    const primary = marketStates[0];

    const summaries = await Promise.all(
      studentParticipants.map(async (part) => {
        const pf = await this.getStudentPortfolio(roomId, part.userId);
        return {
          participantId: part.id,
          userId: part.userId,
          nickname: part.nickname,
          cash: pf.portfolio.cash,
          totalValue: pf.portfolio.totalValue,
          returnPercent: pf.portfolio.returnPercent,
          realizedPnl: pf.portfolio.realizedPnl,
          unrealizedPnl: pf.portfolio.unrealizedPnl,
          positionsCount: pf.positions.length,
          tradesCount: pf.trades.length,
          positions: pf.positions,
          trades: pf.trades,
        };
      }),
    );

    summaries.sort((a, b) => b.totalValue - a.totalValue);

    const shockEvents = await this.events.find({
      where: { roomId: room.id },
      order: { simElapsedSeconds: 'DESC' },
    });
    const triggerPoints = shockEvents
      .filter((ev) => ev.type !== 'ROLLBACK')
      .map((ev) => ({
        id: ev.id,
        type: ev.type,
        title: ev.title,
        description: ev.description,
        simElapsedSeconds: ev.simElapsedSeconds,
        minute: Math.round((ev.simElapsedSeconds / 60) * 10) / 10,
        createdAt: ev.createdAt,
      }));

    return {
      room: {
        id: room.id,
        name: room.name,
        description: room.description ?? null,
        joinCode: room.joinCode,
        status: room.status,
        sourceMode: room.sourceMode,
        assets: this.marketSource.roomSymbols(room),
        ...this.timeView(room, primary),
        maxParticipants: Number(room.maxParticipants),
        initialCapital: Number(room.initialCapital),
        currency: room.currency,
        leverage: Number(room.leverage),
        commissionPercent: Number(room.commissionPercent),
        allowShortSelling: room.allowShortSelling,
        maxExposure: room.maxExposure === null ? null : Number(room.maxExposure),
        riskLimitPercent: room.riskLimitPercent === null ? null : Number(room.riskLimitPercent),
      },
      market: { ...primary, symbols: marketStates },
      leaderboard: summaries,
      triggerPoints,
      isMaster: true,
    };
  }

  private async studentParticipantsOf(room: GameRoom): Promise<GameParticipant[]> {
    const rawParticipants = await this.participants.find({ where: { roomId: room.id } });
    const studentParticipants: GameParticipant[] = [];
    for (const p of rawParticipants) {
      if (p.userId === room.masterId) continue;
      const prof = await this.profilesRepo.findOne({ where: { id: p.userId } });
      if (prof && (prof.role === UserRole.GAME_MASTER || prof.role === UserRole.ADMIN)) continue;
      studentParticipants.push(p);
    }
    return studentParticipants;
  }

  /**
   * Commandes de contrôle de la salle (Play, Pause, Reprendre, Reset, Clôturer).
   */
  async controlRoom(
    roomId: string,
    userId: string,
    action: 'start' | 'pause' | 'resume' | 'reset' | 'finish',
  ): Promise<GameRoom> {
    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Salle introuvable.');
    if (room.masterId !== userId) {
      const profile = await this.profilesRepo.findOne({ where: { id: userId } });
      if (profile?.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Seul le meneur de jeu de cette salle peut la contrôler.');
      }
    }

    if (action === 'start' || action === 'resume') {
      if (action === 'start' && room.status === 'running') {
        throw new BadRequestException('La séance est déjà en cours.');
      }
      room.status = 'running';
      room.startedAt = new Date();
      room.pausedAt = null;
    } else if (action === 'pause') {
      room.simElapsedSeconds = this.marketSource.calculateCurrentElapsedSeconds(room);
      room.status = 'paused';
      room.pausedAt = new Date();
    } else if (action === 'finish') {
      room.simElapsedSeconds = this.marketSource.calculateCurrentElapsedSeconds(room);
      room.status = 'finished';
      room.pausedAt = new Date();
    } else if (action === 'reset') {
      room.status = 'waiting';
      room.simElapsedSeconds = 0;
      room.startedAt = null;
      room.pausedAt = null;
      await this.trades.delete({ roomId });
      await this.orders.delete({ roomId });
      await this.events.delete({ roomId });
      await this.purgeLiveSnapshots(room.id);
      this.simEngine.resetRoomShocks(room.id);
      const capital = Number(room.initialCapital ?? 100000);
      const pfs = await this.portfolios.find({ where: { roomId } });
      for (const p of pfs) {
        p.cash = capital.toFixed(2);
        p.initialCash = capital.toFixed(2);
        await this.portfolios.save(p);
        await this.positions.delete({ portfolioId: p.id });
      }
    }

    return this.rooms.save(room);
  }

  /** Purge les prix live enregistrés pour que le reset reparte d'un marché propre. */
  private async purgeLiveSnapshots(roomId: string): Promise<void> {
    await this.rooms.manager.query(
      `delete from public.game_snapshots
        where room_id = $1 and state->>'kind' = 'live_price'`,
      [roomId],
    );
  }

  /**
   * Valide un fichier CSV de bougies avant la création de la salle :
   * rapporte les lignes rejetées et un aperçu du jeu de données rejouable.
   */
  previewCsv(content: string) {
    const parsed = parseCandlesCsv(content);
    const blocking = parsed.candles.length < 2;
    return {
      valid: !blocking,
      candles: parsed.candles.slice(0, 500),
      candlesCount: parsed.candles.length,
      issues: parsed.issues.slice(0, 100),
      issuesCount: parsed.issues.length,
      summary: {
        spanSeconds: parsed.spanSeconds,
        startAt: parsed.startAt,
        endAt: parsed.endAt,
        minClose: parsed.minClose,
        maxClose: parsed.maxClose,
        firstClose: parsed.candles[0]?.close ?? null,
        lastClose: parsed.candles.at(-1)?.close ?? null,
      },
    };
  }

  /** Change la vitesse de relecture d'une séance (Meneur de Jeu). */
  async setSpeed(roomId: string, userId: string, speed: number): Promise<RoomTimeView> {
    const room = await this.requireMasterRoom(roomId, userId);
    const updated = await this.simEngine.setPlaybackSpeed(room, speed);
    const market = await this.marketSource.getMarketState(updated);
    return this.timeView(updated, market);
  }

  /** Déplace le curseur de séance (timeline) d'une salle. */
  async seek(roomId: string, userId: string, seconds: number): Promise<RoomTimeView> {
    const room = await this.requireMasterRoom(roomId, userId);
    const updated = await this.simEngine.seekTo(room, seconds);
    const market = await this.marketSource.getMarketState(updated);
    return this.timeView(updated, market);
  }

  private async requireMasterRoom(roomId: string, userId: string): Promise<GameRoom> {
    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Salle introuvable.');
    if (room.masterId !== userId) {
      const profile = await this.profilesRepo.findOne({ where: { id: userId } });
      if (profile?.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Réservé au meneur de jeu de cette salle.');
      }
    }
    return room;
  }
}

export interface RoomTimeView {
  simElapsedSeconds: number;
  totalSimSeconds: number;
  currentMinute: number;
  totalMinutes: number;
  durationMinutes: number;
  timeframe: string;
  playbackSpeed: number;
  progressPercent: number;
  marketTimestamp: string;
  historyStartAt: string | null;
  historyEndAt: string | null;
  remainingRealSeconds: number;
}
