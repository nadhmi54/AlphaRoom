import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameEvent } from '../entities/game-event.entity.js';
import { GameParticipant } from '../entities/game-participant.entity.js';
import { GameRoom } from '../entities/game-room.entity.js';
import { GameRunArchive } from '../entities/game-run-archive.entity.js';
import { SimulationOrder } from '../entities/sim-order.entity.js';
import { SimulationTrade } from '../entities/sim-trade.entity.js';
import { eventsOfCurrentRun, type RunSnapshot, type TimedEvent } from '../run-snapshot.js';
import { MarketSourceService } from './market-source.service.js';

const num = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Lecture seule de la simulation pour le module IA, et archivage du passage
 * avant un rollback. N'écrit rien d'autre que `game_run_archives`.
 */
@Injectable()
export class RunSnapshotService {
  constructor(
    @InjectRepository(GameRoom) private readonly rooms: Repository<GameRoom>,
    @InjectRepository(GameParticipant) private readonly participants: Repository<GameParticipant>,
    @InjectRepository(SimulationTrade) private readonly trades: Repository<SimulationTrade>,
    @InjectRepository(SimulationOrder) private readonly orders: Repository<SimulationOrder>,
    @InjectRepository(GameEvent) private readonly events: Repository<GameEvent>,
    @InjectRepository(GameRunArchive) private readonly archives: Repository<GameRunArchive>,
    @Inject(MarketSourceService) private readonly market: MarketSourceService,
  ) {}

  /** Salle par identifiant, ou null (identifiant invalide compris). */
  async findRoom(roomId: string): Promise<GameRoom | null> {
    if (!/^[0-9a-f-]{36}$/i.test(roomId)) return null;
    return this.rooms.findOne({ where: { id: roomId } });
  }

  /** Salles récentes, pour la liste de séances de l'IA. */
  recentRooms(limit = 50): Promise<GameRoom[]> {
    return this.rooms.find({ order: { createdAt: 'DESC' }, take: limit });
  }

  async participantIds(roomIds: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (roomIds.length === 0) return out;
    const rows = await this.participants
      .createQueryBuilder('p')
      .select(['p.roomId', 'p.userId'])
      .where('p.roomId IN (:...roomIds)', { roomIds })
      .getMany();
    for (const row of rows) out.set(row.roomId, [...(out.get(row.roomId) ?? []), row.userId]);
    return out;
  }

  symbolsOf(room: GameRoom): string[] {
    return this.market.roomSymbols(room);
  }

  /** Passages archivés de plusieurs salles en une requête. */
  async archivedRunsByRoom(roomIds: string[]): Promise<Map<string, number[]>> {
    const out = new Map<string, number[]>();
    if (roomIds.length === 0) return out;
    const rows = await this.archives
      .createQueryBuilder('a')
      .select(['a.roomId', 'a.run'])
      .where('a.roomId IN (:...roomIds)', { roomIds })
      .orderBy('a.run', 'ASC')
      .getMany();
    for (const row of rows) out.set(row.roomId, [...(out.get(row.roomId) ?? []), row.run]);
    return out;
  }

  /** Numéros des passages archivés d'une salle, croissants. */
  async archivedRuns(roomId: string): Promise<number[]> {
    const rows = await this.archives.find({ where: { roomId }, select: { run: true }, order: { run: 'ASC' } });
    return rows.map((r) => r.run);
  }

  async archivedSnapshot(roomId: string, run: number): Promise<RunSnapshot | null> {
    const row = await this.archives.findOne({ where: { roomId, run } });
    return row?.snapshot ?? null;
  }

  /** État courant de la salle (dernier passage). */
  async capture(room: GameRoom): Promise<RunSnapshot> {
    const archived = await this.archivedRuns(room.id);
    const run = (archived.at(-1) ?? 0) + 1;
    const symbols = this.market.roomSymbols(room);
    const elapsedSeconds = this.market.calculateCurrentElapsedSeconds(room);

    const [participants, trades, orders, events] = await Promise.all([
      this.participants.find({ where: { roomId: room.id } }),
      this.trades.find({ where: { roomId: room.id }, order: { executedAt: 'ASC' } }),
      this.orders.find({ where: { roomId: room.id } }),
      this.events.find({ where: { roomId: room.id }, order: { simElapsedSeconds: 'ASC' } }),
    ]);

    const series: RunSnapshot['series'] = {};
    for (const symbol of symbols) {
      series[symbol] = (await this.market.buildSeries(room, symbol, elapsedSeconds)).map((p) => ({ t: p.t, price: p.price }));
    }

    const timed: TimedEvent[] = events.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      minute: num(e.simElapsedSeconds) / 60,
      createdAt: e.createdAt,
      payloadTargetMinute: num(e.payload?.targetMinute),
    }));

    return {
      roomId: room.id,
      roomName: room.name,
      run,
      elapsedMinutes: elapsedSeconds / 60,
      durationMinutes: num(room.durationMinutes, 30),
      initialCapital: num(room.initialCapital, 100000),
      symbols,
      sourceMode: room.sourceMode,
      scenarioId: room.scenarioId,
      participants: participants.map((p) => ({ userId: p.userId, nickname: p.nickname })),
      trades: trades.map((t) => ({
        id: t.id,
        userId: t.userId,
        symbol: t.symbol,
        side: t.side,
        quantity: num(t.quantity),
        price: num(t.price),
        minute: num(t.simMinute),
        orderId: t.orderId,
      })),
      orders: orders.map((o) => ({
        id: o.id,
        userId: o.userId,
        symbol: o.symbol,
        stopLoss: o.stopLoss === null ? null : num(o.stopLoss),
        takeProfit: o.takeProfit === null ? null : num(o.takeProfit),
      })),
      events: eventsOfCurrentRun(timed),
      series,
    };
  }

  /**
   * À appeler AVANT un rollback : garde le passage en cours. Sans effet s'il
   * n'y a encore rien à conserver (aucune exécution) : le passage reste alors
   * le même et on n'en crée pas un vide.
   */
  async archiveCurrentRun(room: GameRoom): Promise<number | null> {
    const snapshot = await this.capture(room);
    if (snapshot.trades.length === 0) return null;
    await this.archives.save(this.archives.create({ roomId: room.id, run: snapshot.run, snapshot }));
    return snapshot.run;
  }
}
