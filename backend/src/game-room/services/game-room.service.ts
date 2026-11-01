import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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
import { SimulationEngineService } from './simulation-engine.service.js';
import {
  calculateScenarioPrice,
  PANIC_TUESDAY_SCENARIO,
} from '../scenario/panic-tuesday.scenario.js';
import { Profile } from '../../users/profile.entity.js';
import { UserRole } from '../../users/user-role.enum.js';

@Injectable()
export class GameRoomService {
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

  /**
   * Créer ou récupérer la salle de démonstration par défaut "Le mardi de la panique".
   */
  async getOrCreateDemoRoom(preferredMasterId?: string): Promise<GameRoom> {
    let demo = await this.rooms.findOne({ where: { scenarioId: 'panic_tuesday' } });
    if (!demo) {
      let masterId = preferredMasterId;
      if (!masterId) {
        const gm = await this.profilesRepo.findOne({ where: { role: UserRole.GAME_MASTER } });
        masterId = gm?.id;
      }
      demo = this.rooms.create({
        name: 'Le mardi de la panique — Séance principale',
        joinCode: 'PANIC1',
        masterId,
        scenarioId: 'panic_tuesday',
        status: 'waiting',
        simElapsedSeconds: 0,
      });
      demo = await this.rooms.save(demo);
    }
    return demo;
  }

  /**
   * Création d'une nouvelle Game Room par un enseignant.
   */
  async createRoom(masterId: string, name: string, scenarioId = 'panic_tuesday'): Promise<GameRoom> {
    const joinCode = this.generateJoinCode();
    const room = this.rooms.create({
      name: name || PANIC_TUESDAY_SCENARIO.name,
      joinCode,
      masterId,
      scenarioId,
      status: 'waiting',
      simElapsedSeconds: 0,
    });
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

    // Enregistrer le participant s'il n'est pas déjà présent
    let participant = await this.participants.findOne({
      where: { roomId: room.id, userId },
    });
    if (!participant) {
      participant = this.participants.create({
        roomId: room.id,
        userId,
        nickname: nickname || `Étudiant-${userId.slice(0, 4)}`,
        isActive: true,
      });
      await this.participants.save(participant);
    }

    // Assurer l'existence du portefeuille virtuel dédié à cette Game Room
    let portfolio = await this.portfolios.findOne({
      where: { roomId: room.id, userId },
    });
    if (!portfolio) {
      portfolio = this.portfolios.create({
        roomId: room.id,
        userId,
        cash: '100000.00',
        initialCash: '100000.00',
      });
      await this.portfolios.save(portfolio);
    }

    return { room, participant, portfolio };
  }

  /**
   * Récupérer les détails d'une salle avec statut, temps, prix et participants connectés.
   */
  async getRoomDetails(roomId: string, userId: string, userRole = 'trader') {
    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Salle introuvable.');

    // Vérifier les déclenchements d'ordres automatiques
    if (room.status === 'running') {
      await this.simEngine.checkTriggeredOrdersAndProtections(room);
    }

    const marketState = this.simEngine.getCurrentMarketState(room);
    const rawParticipants = await this.participants.find({ where: { roomId: room.id } });
    const studentParticipants: GameParticipant[] = [];
    for (const p of rawParticipants) {
      if (p.userId === room.masterId) continue;
      const prof = await this.profilesRepo.findOne({ where: { id: p.userId } });
      if (prof && (prof.role === 'game_master' || prof.role === 'admin')) continue;
      studentParticipants.push(p);
    }
    const book = await this.simEngine.getOrderBook(room);

    // Série temporelle du prix depuis la minute 0 jusqu'à la minute courante
    const points: Array<{ t: number; price: number }> = [];
    const stepSeconds = 15; // Point tous les 15s pour le graphique
    for (let s = 0; s <= marketState.elapsedSeconds; s += stepSeconds) {
      const pt = calculateScenarioPrice(s);
      points.push({ t: s, price: pt.price });
    }
    // Ajouter le point exact courant
    points.push({ t: marketState.elapsedSeconds, price: marketState.price });

    const recentEvents = await this.events.find({
      where: { roomId: room.id },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const isMaster = userRole === 'game_master' || userRole === 'admin';

    return {
      room: {
        id: room.id,
        name: room.name,
        joinCode: room.joinCode,
        status: room.status,
        scenarioId: room.scenarioId,
        scenarioName: PANIC_TUESDAY_SCENARIO.name,
        simElapsedSeconds: marketState.elapsedSeconds,
        currentMinute: marketState.currentMinute,
        totalMinutes: PANIC_TUESDAY_SCENARIO.durationMinutes,
        isMaster,
        userRole,
      },
      market: {
        symbol: marketState.symbol,
        price: marketState.price,
        spread: marketState.spread,
        series: points,
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

  /**
   * Portefeuille virtuel de l'étudiant dans la Game Room.
   * Totalement isolé de tout autre portefeuille ou du module /marche.
   */
  async getStudentPortfolio(roomId: string, userId: string) {
    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Salle introuvable.');

    let portfolio = await this.portfolios.findOne({ where: { roomId, userId } });
    if (!portfolio) {
      portfolio = this.portfolios.create({
        roomId,
        userId,
        cash: '100000.00',
        initialCash: '100000.00',
      });
      portfolio = await this.portfolios.save(portfolio);
    }

    const marketState = this.simEngine.getCurrentMarketState(room);
    const positions = await this.positions.find({ where: { portfolioId: portfolio.id } });
    const trades = await this.trades.find({
      where: { portfolioId: portfolio.id },
      order: { executedAt: 'DESC' },
    });

    // Positions valorisées au prix simulé actuel
    let positionsMarketValue = 0;
    let totalUnrealizedPnl = 0;

    const positionViews = positions.map((pos) => {
      const qty = Number(pos.quantity);
      const avgPrice = Number(pos.averagePrice);
      const mktVal = qty * marketState.price;
      const unrlz = qty * (marketState.price - avgPrice);

      positionsMarketValue += mktVal;
      totalUnrealizedPnl += unrlz;

      return {
        id: pos.id,
        symbol: pos.symbol,
        quantity: qty,
        averagePrice: avgPrice,
        currentPrice: marketState.price,
        marketValue: Math.round(mktVal * 100) / 100,
        unrealizedPnl: Math.round(unrlz * 100) / 100,
        stopLoss: pos.stopLoss ? Number(pos.stopLoss) : null,
        takeProfit: pos.takeProfit ? Number(pos.takeProfit) : null,
      };
    });

    const cash = Number(portfolio.cash);
    const initialCash = Number(portfolio.initialCash);
    const totalValue = Math.round((cash + positionsMarketValue) * 100) / 100;
    const returnAmount = Math.round((totalValue - initialCash) * 100) / 100;
    const returnPercent = Math.round((returnAmount / initialCash) * 10000) / 100;

    // Calcul P&L Réalisé depuis les trades
    let realizedPnl = 0;
    let runningQty = 0;
    let runningAvg = 0;
    const sortedTrades = [...trades].sort((a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime());
    for (const t of sortedTrades) {
      const q = Number(t.quantity);
      const p = Number(t.price);
      if (t.side === 'buy') {
        const nextQ = runningQty + q;
        runningAvg = (runningQty * runningAvg + q * p) / nextQ;
        runningQty = nextQ;
      } else {
        realizedPnl += q * (p - runningAvg);
        runningQty = Math.max(0, runningQty - q);
      }
    }

    return {
      portfolio: {
        id: portfolio.id,
        cash,
        initialCash,
        positionsMarketValue: Math.round(positionsMarketValue * 100) / 100,
        totalValue,
        realizedPnl: Math.round(realizedPnl * 100) / 100,
        unrealizedPnl: Math.round(totalUnrealizedPnl * 100) / 100,
        returnAmount,
        returnPercent,
      },
      positions: positionViews.filter((p) => p.quantity > 0),
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
    if (userRole !== 'game_master' && userRole !== 'admin') {
      throw new ForbiddenException('Accès au tableau de bord réservé au Meneur de Jeu');
    }

    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Salle introuvable.');

    const isMaster = true;
    const rawParticipants = await this.participants.find({ where: { roomId } });
    const marketState = this.simEngine.getCurrentMarketState(room);

    // Filtrer pour n'inclure que les étudiants (exclure le meneur de jeu et les admins)
    const studentParticipants: GameParticipant[] = [];
    for (const part of rawParticipants) {
      if (part.userId === room.masterId) continue;
      const prof = await this.profilesRepo.findOne({ where: { id: part.userId } });
      if (prof && (prof.role === 'game_master' || prof.role === 'admin')) continue;
      studentParticipants.push(part);
    }

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

    // Récupérer les déclenchements de chocs et news enregistrés dans cette salle pour le rollback
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
        joinCode: room.joinCode,
        status: room.status,
        simElapsedSeconds: marketState.elapsedSeconds,
        currentMinute: marketState.currentMinute,
      },
      market: marketState,
      leaderboard: summaries,
      triggerPoints,
      isMaster,
    };
  }

  /**
   * Commandes de contrôle de la salle (Play, Pause, Reprendre, Vitesse).
   */
  async controlRoom(roomId: string, userId: string, action: 'start' | 'pause' | 'resume' | 'reset') {
    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Salle introuvable.');

    if (action === 'start' || action === 'resume') {
      room.status = 'running';
      room.startedAt = new Date();
    } else if (action === 'pause') {
      const elapsed = this.simEngine.calculateCurrentElapsedSeconds(room);
      room.simElapsedSeconds = elapsed;
      room.status = 'paused';
      room.pausedAt = new Date();
    } else if (action === 'reset') {
      room.status = 'waiting';
      room.simElapsedSeconds = 0;
      room.startedAt = null;
      room.pausedAt = null;
      // Remise à zéro des portefeuilles et positions
      await this.trades.delete({ roomId });
      await this.orders.delete({ roomId });
      await this.events.delete({ roomId });
      this.simEngine.resetRoomShocks(room.id);
      const pfs = await this.portfolios.find({ where: { roomId } });
      for (const p of pfs) {
        p.cash = '100000.00';
        await this.portfolios.save(p);
        await this.positions.delete({ portfolioId: p.id });
      }
    }

    return this.rooms.save(room);
  }
}
