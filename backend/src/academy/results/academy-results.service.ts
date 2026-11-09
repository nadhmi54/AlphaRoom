import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import { GameRoomService } from '../../game-room/services/game-room.service.js';
import { MarketSourceService } from '../../game-room/services/market-source.service.js';
import type { GameRoom } from '../../game-room/entities/game-room.entity.js';
import type { SimulationTrade } from '../../game-room/entities/sim-trade.entity.js';
import { PerformanceMetricsService } from '../../portefeuille/performance/performance-metrics.service.js';
import { UserRole } from '../../users/user-role.enum.js';
import { AcademyRulesService } from '../rules/academy-rules.service.js';
import { computeRiskAdjustedScore } from '../rules/risk-score.js';
import { AcademyGameResult } from './academy-game-result.entity.js';
import {
  buildPortfolioValueSeries,
  returnPercentFromSeries,
  type PortfolioTrade,
  type PricePoint,
} from './portfolio-value.js';

/**
 * Adaptateur de réception des résultats (Option A, validée en phase 1).
 *
 * Il lit la Game Room en LECTURE SEULE (participants, exécutions, configuration,
 * courbes de prix) — sans jamais créer ni modifier une ligne de la Game Room — et
 * transforme chaque participant d'une partie terminée en un résultat normalisé
 * `academy_game_results`. Le reste du module ne dépend ensuite que de l'événement
 * interne « partie terminée », émis vers le moteur de règles.
 *
 * Anti-jointure : ne sont ingérés que les participants d'une partie terminée qui
 * n'ont pas encore de résultat pour cette salle.
 */
@Injectable()
export class AcademyResultsService {
  private readonly logger = new Logger(AcademyResultsService.name);

  constructor(
    @InjectRepository(AcademyGameResult)
    private readonly results: Repository<AcademyGameResult>,
    private readonly gameRoom: GameRoomService,
    private readonly marketSource: MarketSourceService,
    private readonly performance: PerformanceMetricsService,
    private readonly rules: AcademyRulesService,
  ) {}

  /** Ingère toutes les parties terminées non encore traitées. */
  async ingestFinishedRooms(): Promise<number> {
    const rooms = await this.gameRoom.rooms.find({ where: { status: 'finished' } });
    let ingested = 0;
    for (const room of rooms) {
      ingested += await this.ingestRoom(room);
    }
    return ingested;
  }

  /** Ingère une salle terminée. Renvoie le nombre de résultats créés. */
  async ingestRoom(room: GameRoom): Promise<number> {
    const participants = await this.gameRoom.participants.find({ where: { roomId: room.id } });
    const candidates = participants.filter((participant) => participant.userId !== room.masterId);
    if (candidates.length === 0) return 0;

    const ingestedUserIds = new Set(
      (await this.results.find({ where: { roomId: room.id } })).map((row) => row.userId),
    );

    // On ne retient que les étudiants : les comptes meneur de jeu / administrateur
    // ne sont pas évalués par l'Academy.
    const profiles = await this.gameRoom.profilesRepo.find({
      where: { id: In(candidates.map((participant) => participant.userId)) },
    });
    const studentIds = new Set(
      profiles
        .filter((profile) => profile.role !== UserRole.GAME_MASTER && profile.role !== UserRole.ADMIN)
        .map((profile) => profile.id),
    );

    const trades = await this.gameRoom.trades.find({
      where: { roomId: room.id },
      order: { simMinute: 'ASC' },
    });
    const tradesByUser = new Map<string, SimulationTrade[]>();
    for (const trade of trades) {
      const list = tradesByUser.get(trade.userId);
      if (list) list.push(trade);
      else tradesByUser.set(trade.userId, [trade]);
    }

    let ingested = 0;
    for (const participant of candidates) {
      if (ingestedUserIds.has(participant.userId) || !studentIds.has(participant.userId)) continue;
      const result = await this.computeResult(room, participant.userId, tradesByUser.get(participant.userId) ?? []);
      const saved = await this.results.save(this.results.create(result));
      ingested += 1;

      await this.rules.processEvent({
        type: 'game_finished',
        userId: participant.userId,
        roomId: room.id,
        resultId: saved.id,
        scenarioId: room.scenarioId,
        metrics: {
          returnPercent: Number(saved.returnPercent),
          maxDrawdown: saved.maxDrawdown === null ? null : Number(saved.maxDrawdown),
          sharpe: saved.sharpe === null ? null : Number(saved.sharpe),
          ordersCount: saved.ordersCount,
          durationSeconds: saved.durationSeconds,
        },
      });
    }

    return ingested;
  }

  private async computeResult(
    room: GameRoom,
    userId: string,
    userTrades: SimulationTrade[],
  ): Promise<Partial<AcademyGameResult>> {
    const elapsed = this.marketSource.calculateCurrentElapsedSeconds(room);
    const initialCash = Number(room.initialCapital ?? 100000);

    const prices: Record<string, PricePoint[]> = {};
    for (const symbol of this.marketSource.roomSymbols(room)) {
      prices[symbol] = await this.marketSource.buildSeries(room, symbol, elapsed);
    }

    const trades: PortfolioTrade[] = userTrades.map((trade) => ({
      symbol: trade.symbol,
      side: trade.side,
      quantity: Number(trade.quantity),
      price: Number(trade.price),
      t: Number(trade.simMinute) * 60,
    }));

    const series = buildPortfolioValueSeries({ initialCash, trades, prices, endT: elapsed });
    const values = series.map((point) => point.value);
    const returns = this.performance.computeDailyReturns(values);

    const returnPercent = returnPercentFromSeries(values, initialCash);
    const maxDrawdown = values.length >= 2 ? this.performance.computeMaxDrawdown(values) : null;
    const sharpe = returns.length >= 2 ? this.performance.computeSharpeRatio(returns) : null;
    const score = computeRiskAdjustedScore({ returnPercent, sharpe, maxDrawdown });
    const durationSeconds = Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : null;

    return {
      roomId: room.id,
      userId,
      scenarioId: room.scenarioId,
      score: score.toFixed(4),
      returnPercent: returnPercent.toFixed(4),
      maxDrawdown: maxDrawdown === null ? null : maxDrawdown.toFixed(6),
      sharpe: sharpe === null ? null : sharpe.toFixed(6),
      // Les ordres exécutés servent de mesure des ordres passés : seuls les
      // échanges effectivement enregistrés sont connus de l'Academy.
      ordersCount: userTrades.length,
      durationSeconds,
      raw: {
        source: 'game_room_read_only',
        tradesCount: userTrades.length,
        seriesPoints: values.length,
        reconstructed: true,
        note: 'Valeur reconstruite depuis sim_trades et les prix du scénario (commissions et marge non rejouées).',
      },
    };
  }
}
