import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameRoom } from '../entities/game-room.entity.js';
import { SimulationPortfolio } from '../entities/sim-portfolio.entity.js';
import { SimulationPosition } from '../entities/sim-position.entity.js';
import { SimulationOrder, SimOrderSide, SimOrderType } from '../entities/sim-order.entity.js';
import { SimulationTrade } from '../entities/sim-trade.entity.js';
import { GameEvent, GameEventType } from '../entities/game-event.entity.js';
import { GameSnapshot } from '../entities/game-snapshot.entity.js';
import {
  MarketSourceService,
  playbackSpeed,
  totalSimSeconds,
  type MarketState,
} from './market-source.service.js';
import { assetDecimals } from '../../portefeuille/trading/market-assets.js';

export interface SimBookLevel {
  price: number;
  quantity: number;
  orders: number;
}

export interface SimOrderBookView {
  symbol: string;
  lastPrice: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  bids: SimBookLevel[];
  asks: SimBookLevel[];
  simMinute: number;
}

/** Profondeur et pas de cotation de la liquidité système, par actif. */
const BOOK_DEPTH: Record<string, { baseQty: number; step: number }> = {
  'XAU/USD': { baseQty: 15, step: 0.25 },
  'EUR/USD': { baseQty: 25_000, step: 0.0002 },
  'BTC/USD': { baseQty: 0.75, step: 25 },
  AAPL: { baseQty: 200, step: 0.05 },
};

const LEVEL_MATCH_TOLERANCE = 0.05;

@Injectable()
export class SimulationEngineService {
  private readonly logger = new Logger(SimulationEngineService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(GameRoom) private readonly rooms: Repository<GameRoom>,
    @InjectRepository(SimulationPortfolio) private readonly portfolios: Repository<SimulationPortfolio>,
    @InjectRepository(SimulationPosition) private readonly positions: Repository<SimulationPosition>,
    @InjectRepository(SimulationOrder) private readonly orders: Repository<SimulationOrder>,
    @InjectRepository(SimulationTrade) private readonly trades: Repository<SimulationTrade>,
    @InjectRepository(GameEvent) private readonly events: Repository<GameEvent>,
    @InjectRepository(GameSnapshot) private readonly snapshots: Repository<GameSnapshot>,
    private readonly marketSource: MarketSourceService,
  ) {}

  /** Temps écoulé de simulation, vitesse de relecture comprise. */
  calculateCurrentElapsedSeconds(room: GameRoom): number {
    return this.marketSource.calculateCurrentElapsedSeconds(room);
  }

  /** Prix actuel, minute et spread de la simulation pour une salle et un actif. */
  getCurrentMarketState(room: GameRoom, symbol?: string): Promise<MarketState> {
    return this.marketSource.getMarketState(room, symbol);
  }

  /** Prix de tous les actifs configurés dans la salle. */
  getRoomMarketStates(room: GameRoom): Promise<MarketState[]> {
    return this.marketSource.getMarketStates(room);
  }

  resetRoomShocks(roomId: string): void {
    this.marketSource.resetRoomShocks(roomId);
  }

  /**
   * Carnet d'ordres simulé : liquidité système autour du prix de la source,
   * plus les ordres limites en attente des participants sur cet actif.
   */
  async getOrderBook(room: GameRoom, symbol?: string): Promise<SimOrderBookView> {
    const state = await this.marketSource.getMarketState(room, symbol);
    const decimals = assetDecimals(state.symbol);
    const halfSpread = state.spread / 2;
    const bestBid = Number((state.price - halfSpread).toFixed(decimals));
    const bestAsk = Number((state.price + halfSpread).toFixed(decimals));

    const depthConfig = BOOK_DEPTH[state.symbol] ?? { baseQty: 15, step: state.price * 0.0001 };
    const baseQty = depthConfig.baseQty * state.shocks.liquidityFactor;

    const bids: SimBookLevel[] = [];
    const asks: SimBookLevel[] = [];
    const depth = 6;
    for (let i = 0; i < depth; i++) {
      const offset = i === 0 ? 0 : depthConfig.step * (i + 1);
      const bidPrice = Number((bestBid - offset).toFixed(decimals));
      const askPrice = Number((bestAsk + offset).toFixed(decimals));

      bids.push({
        price: bidPrice,
        quantity: Math.round((baseQty * (1 + i * 0.4) + Math.sin(bidPrice * 10) * 3) * 100) / 100,
        orders: 3 + i * 2,
      });
      asks.push({
        price: askPrice,
        quantity: Math.round((baseQty * (1 + i * 0.4) + Math.cos(askPrice * 10) * 3) * 100) / 100,
        orders: 3 + i * 2,
      });
    }

    const pendingOrders = await this.orders.find({
      where: { roomId: room.id, status: 'open', symbol: state.symbol },
    });

    for (const ord of pendingOrders) {
      if (!ord.limitPrice) continue;
      const lPrice = Number(ord.limitPrice);
      const rem = Number(ord.remainingQuantity);
      const sideLevels = ord.side === 'buy' ? bids : asks;
      const reference = ord.side === 'buy' ? bestBid : bestAsk;
      const inRange = ord.side === 'buy' ? lPrice <= reference : lPrice >= reference;
      const found = sideLevels.find((level) => Math.abs(level.price - lPrice) < LEVEL_MATCH_TOLERANCE);
      if (found) {
        found.quantity = Math.round((found.quantity + rem) * 100) / 100;
        found.orders += 1;
      } else if (inRange) {
        sideLevels.push({ price: lPrice, quantity: rem, orders: 1 });
      }
    }

    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);

    return {
      symbol: state.symbol,
      lastPrice: state.price,
      bestBid: bids[0]?.price ?? bestBid,
      bestAsk: asks[0]?.price ?? bestAsk,
      spread: Number(((asks[0]?.price ?? bestAsk) - (bids[0]?.price ?? bestBid)).toFixed(decimals)),
      bids: bids.slice(0, 8),
      asks: asks.slice(0, 8),
      simMinute: state.currentMinute,
    };
  }

  /**
   * Passage d'un ordre dans la Game Room.
   * Applique la configuration de la salle : levier, commissions, vente à découvert,
   * exposition maximale et limite de risque par position.
   */
  async placeSimulationOrder(params: {
    room: GameRoom;
    userId: string;
    symbol: string;
    side: SimOrderSide;
    type: SimOrderType;
    quantity: number;
    limitPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
  }) {
    const { room, userId, side, type, limitPrice, stopLoss, takeProfit } = params;
    const symbol = this.assertRoomSymbol(room, params.symbol);
    const quantity = params.quantity;

    if (!(quantity > 0)) {
      throw new BadRequestException('La quantité doit être supérieure à zéro.');
    }
    if (type === 'limit' && !(limitPrice && limitPrice > 0)) {
      throw new BadRequestException('Le prix limite doit être spécifié et supérieur à 0.');
    }

    const config = readRoomConfig(room);
    const decimals = assetDecimals(symbol);
    const state = await this.marketSource.getMarketState(room, symbol);
    const book = await this.getOrderBook(room, symbol);

    const crosses =
      type === 'market' ||
      (side === 'buy' && (limitPrice as number) >= book.bestAsk) ||
      (side === 'sell' && (limitPrice as number) <= book.bestBid);

    return this.dataSource.transaction(async (manager) => {
      const portfolioRepo = manager.getRepository(SimulationPortfolio);
      const positionRepo = manager.getRepository(SimulationPosition);

      let portfolio = await portfolioRepo.findOne({
        where: { roomId: room.id, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!portfolio) {
        portfolio = portfolioRepo.create({
          roomId: room.id,
          userId,
          cash: config.initialCapital.toFixed(2),
          initialCash: config.initialCapital.toFixed(2),
        });
        portfolio = await portfolioRepo.save(portfolio);
      }

      let position = await positionRepo.findOne({
        where: { portfolioId: portfolio.id, symbol },
      });
      const held = Number(position?.quantity ?? 0);
      const averagePrice = Number(position?.averagePrice ?? 0);
      const cash = Number(portfolio.cash);

      if (!crosses) {
        this.validatePendingOrder({ config, room, symbol, side, quantity, limitPrice: limitPrice as number, held, cash, stopLoss });
        const order = manager.getRepository(SimulationOrder).create({
          roomId: room.id,
          userId,
          portfolioId: portfolio.id,
          symbol,
          side,
          type: 'limit',
          quantity: quantity.toFixed(6),
          filledQuantity: '0',
          remainingQuantity: quantity.toFixed(6),
          limitPrice: (limitPrice as number).toFixed(decimals),
          status: 'open',
          stopLoss: stopLoss ? stopLoss.toFixed(decimals) : null,
          takeProfit: takeProfit ? takeProfit.toFixed(decimals) : null,
        });
        const savedOrder = await manager.getRepository(SimulationOrder).save(order);
        return { order: savedOrder, trade: null };
      }

      const executionPrice =
        type === 'market'
          ? side === 'buy'
            ? book.bestAsk
            : book.bestBid
          : side === 'buy'
            ? Math.min(limitPrice as number, book.bestAsk)
            : Math.max(limitPrice as number, book.bestBid);

      if (side === 'sell' && held - quantity < -1e-9 && !config.allowShortSelling) {
        throw new BadRequestException(
          `Quantité insuffisante à vendre : détenu ${formatQty(held)} ${symbol}. La vente à découvert est désactivée dans cette salle.`,
        );
      }

      const fill = applyFill({
        side,
        quantity,
        price: executionPrice,
        commissionPercent: config.commissionPercent,
        leverage: config.leverage,
        held,
        averagePrice,
        cash,
      });

      if (fill.cash < -1e-6) {
        throw new BadRequestException(
          `Fonds insuffisants en Game Room : marge requise ${round2(fill.margin)} ${room.currency} (levier x${config.leverage}) + commission ${round2(fill.commission)}, disponible ${round2(cash)} ${room.currency}.`,
        );
      }

      if (config.maxExposure !== null && Math.abs(fill.quantity) * executionPrice > config.maxExposure + 1e-6) {
        throw new BadRequestException(
          `Exposition maximale de la salle dépassée : ${round2(Math.abs(fill.quantity) * executionPrice)} ${room.currency} > ${round2(config.maxExposure)} ${room.currency}.`,
        );
      }

      const opensNewDirection = (side === 'buy' && held >= 0) || (side === 'sell' && held <= 0);
      if (opensNewDirection && config.riskLimitPercent !== null) {
        assertRiskWithinLimit({
          symbol,
          side,
          quantity,
          entryPrice: executionPrice,
          stopLoss,
          riskLimitPercent: config.riskLimitPercent,
          initialCapital: config.initialCapital,
          currency: room.currency,
        });
      }

      const order = manager.getRepository(SimulationOrder).create({
        roomId: room.id,
        userId,
        portfolioId: portfolio.id,
        symbol,
        side,
        type,
        limitPrice: type === 'limit' ? (limitPrice as number).toFixed(decimals) : null,
        quantity: quantity.toFixed(6),
        filledQuantity: quantity.toFixed(6),
        remainingQuantity: '0',
        averagePrice: executionPrice.toFixed(decimals),
        status: 'filled',
        stopLoss: stopLoss ? stopLoss.toFixed(decimals) : null,
        takeProfit: takeProfit ? takeProfit.toFixed(decimals) : null,
      });
      const savedOrder = await manager.getRepository(SimulationOrder).save(order);

      portfolio.cash = Math.max(0, fill.cash).toFixed(2);
      if (!position) {
        position = positionRepo.create({ portfolioId: portfolio.id, symbol });
      }
      position.quantity = fill.quantity.toFixed(6);
      position.averagePrice = fill.averagePrice.toFixed(4);
      if (Math.abs(fill.quantity) < 1e-9) {
        position.averagePrice = '0';
        position.stopLoss = null;
        position.takeProfit = null;
      } else {
        if (stopLoss) position.stopLoss = stopLoss.toFixed(decimals);
        if (takeProfit) position.takeProfit = takeProfit.toFixed(decimals);
      }
      await positionRepo.save(position);
      await portfolioRepo.save(portfolio);

      const notional = Math.round(quantity * executionPrice * 100) / 100;
      const trade = manager.getRepository(SimulationTrade).create({
        roomId: room.id,
        userId,
        portfolioId: portfolio.id,
        orderId: savedOrder.id,
        symbol,
        side,
        quantity: quantity.toFixed(6),
        price: executionPrice.toFixed(decimals),
        amount: notional.toFixed(2),
        simMinute: state.currentMinute,
      });
      await manager.getRepository(SimulationTrade).save(trade);

      return {
        order: savedOrder,
        trade,
        executedPrice: executionPrice,
        commission: round2(fill.commission),
        margin: round2(fill.margin),
        realizedPnl: round2(fill.realizedPnl),
        notional,
        portfolioCash: Number(portfolio.cash),
      };
    });
  }

  /** Contrôles d'un ordre limite qui part au carnet (aucune exécution immédiate). */
  private validatePendingOrder(args: {
    config: RoomTradingConfig;
    room: GameRoom;
    symbol: string;
    side: SimOrderSide;
    quantity: number;
    limitPrice: number;
    held: number;
    cash: number;
    stopLoss?: number;
  }): void {
    const { config, room, symbol, side, quantity, limitPrice, held, cash, stopLoss } = args;

    if (side === 'sell' && held - quantity < -1e-9 && !config.allowShortSelling) {
      throw new BadRequestException('Quantité insuffisante pour poser cet ordre de vente.');
    }

    const margin = (quantity * limitPrice) / config.leverage;
    if (side === 'buy' && margin + 1e-9 > cash) {
      throw new BadRequestException(
        `Cash insuffisant pour poser cet ordre limite : ${round2(margin)} ${room.currency} de marge requise (levier x${config.leverage}).`,
      );
    }
    if (config.maxExposure !== null) {
      const exposure = Math.abs(side === 'buy' ? held + quantity : held - quantity) * limitPrice;
      if (exposure > config.maxExposure + 1e-6) {
        throw new BadRequestException(
          `Exposition maximale de la salle dépassée : ${round2(exposure)} ${room.currency} > ${round2(config.maxExposure)} ${room.currency}.`,
        );
      }
    }
    const opensNewDirection = (side === 'buy' && held >= 0) || (side === 'sell' && held <= 0);
    if (opensNewDirection && config.riskLimitPercent !== null) {
      assertRiskWithinLimit({
        symbol,
        side,
        quantity,
        entryPrice: limitPrice,
        stopLoss,
        riskLimitPercent: config.riskLimitPercent,
        initialCapital: config.initialCapital,
        currency: room.currency,
      });
    }
  }

  /** Clôture immédiate au marché d'une position (longue ou courte). */
  async closePosition(room: GameRoom, userId: string, symbol: string) {
    const active = this.assertRoomSymbol(room, symbol);
    const portfolio = await this.portfolios.findOne({ where: { roomId: room.id, userId } });
    if (!portfolio) throw new BadRequestException('Portefeuille introuvable.');

    const position = await this.positions.findOne({ where: { portfolioId: portfolio.id, symbol: active } });
    const qty = Number(position?.quantity ?? 0);
    if (!position || Math.abs(qty) <= 1e-9) {
      throw new BadRequestException('Aucune position ouverte sur cet actif.');
    }

    return this.placeSimulationOrder({
      room,
      userId,
      symbol: active,
      side: qty > 0 ? 'sell' : 'buy',
      type: 'market',
      quantity: Math.abs(qty),
    });
  }

  /**
   * Déclenche les ordres limites et les protections Stop-Loss / Take-Profit des
   * participants de la salle lorsque le cours franchit leurs seuils.
   */
  async checkTriggeredOrdersAndProtections(room: GameRoom): Promise<void> {
    const openOrders = await this.orders.find({
      where: { roomId: room.id, status: 'open' },
    });

    for (const ord of openOrders) {
      if (ord.type !== 'limit' || !ord.limitPrice) continue;
      const state = await this.marketSource.getMarketState(room, ord.symbol);
      const currentPrice = state.price;
      const lPrice = Number(ord.limitPrice);
      const shouldFill =
        (ord.side === 'buy' && currentPrice <= lPrice) || (ord.side === 'sell' && currentPrice >= lPrice);
      if (!shouldFill) continue;
      try {
        await this.placeSimulationOrder({
          room,
          userId: ord.userId,
          symbol: ord.symbol,
          side: ord.side,
          type: 'market',
          quantity: Number(ord.remainingQuantity),
          stopLoss: ord.stopLoss ? Number(ord.stopLoss) : undefined,
          takeProfit: ord.takeProfit ? Number(ord.takeProfit) : undefined,
        });
        ord.status = 'filled';
        ord.filledQuantity = ord.quantity;
        ord.remainingQuantity = '0';
        ord.averagePrice = currentPrice.toFixed(assetDecimals(ord.symbol));
        await this.orders.save(ord);
      } catch (err) {
        this.logger.error(`Erreur déclenchement ordre limite ${ord.id}:`, err);
      }
    }

    // Positions de la salle uniquement : jamais celles d'une autre Game Room.
    const roomPortfolios = await this.portfolios.find({ where: { roomId: room.id } });
    if (roomPortfolios.length === 0) return;
    const portfolioIds = roomPortfolios.map((pf) => pf.id);
    const roomPositions = await this.positions
      .createQueryBuilder('position')
      .where('position.portfolio_id in (:...portfolioIds)', { portfolioIds })
      .getMany();

    for (const pos of roomPositions) {
      const qty = Number(pos.quantity);
      if (Math.abs(qty) <= 1e-9) continue;
      const sl = pos.stopLoss ? Number(pos.stopLoss) : null;
      const tp = pos.takeProfit ? Number(pos.takeProfit) : null;
      if (sl === null && tp === null) continue;

      const state = await this.marketSource.getMarketState(room, pos.symbol);
      const currentPrice = state.price;
      const long = qty > 0;
      const hitSl = sl !== null && (long ? currentPrice <= sl : currentPrice >= sl);
      const hitTp = tp !== null && (long ? currentPrice >= tp : currentPrice <= tp);
      if (!hitSl && !hitTp) continue;

      const portfolio = roomPortfolios.find((pf) => pf.id === pos.portfolioId);
      if (!portfolio) continue;
      const reason = hitSl ? 'Stop-Loss' : 'Take-Profit';
      try {
        await this.placeSimulationOrder({
          room,
          userId: portfolio.userId,
          symbol: pos.symbol,
          side: long ? 'sell' : 'buy',
          type: 'market',
          quantity: Math.abs(qty),
        });
        this.logger.log(`Position clôturée automatiquement (${reason}) pour l'utilisateur ${portfolio.userId}`);
      } catch (err) {
        this.logger.error(`Erreur clôture protection ${pos.id}:`, err);
      }
    }
  }

  /**
   * Commandes du Meneur de Jeu : chocs de prix, spread, liquidité, news, whale, rollback.
   */
  async applyGameMasterAction(room: GameRoom, action: {
    type: GameEventType;
    title: string;
    description?: string;
    payload?: Record<string, any>;
  }) {
    const elapsed = this.calculateCurrentElapsedSeconds(room);
    const currentShocks = this.marketSource.getShocks(room.id);
    const payload: Record<string, any> = { ...action.payload };

    if (action.type === 'PRICE_SHOCK' && payload.priceDelta === undefined) {
      const baseState = await this.marketSource.getMarketState(room);
      const percent = Number(payload.percent);
      payload.priceDelta = Number.isFinite(percent) && percent !== 0
        ? -Math.abs(baseState.price * (percent / 100))
        : -50;
    }

    const event = this.events.create({
      roomId: room.id,
      type: action.type,
      title: action.title,
      description: action.description ?? null,
      payload,
      simElapsedSeconds: elapsed,
    });
    await this.events.save(event);

    switch (action.type) {
      case 'PRICE_SHOCK': {
        const delta = Number(payload.priceDelta ?? -50);
        currentShocks.priceOffset += Number.isFinite(delta) ? delta : 0;
        break;
      }
      case 'SPREAD_SHOCK': {
        const factor = Number(payload.multiplier ?? 4.0);
        currentShocks.spreadMultiplier = Number.isFinite(factor) && factor > 0 ? factor : 1;
        break;
      }
      case 'LIQUIDITY_SHOCK': {
        const factor = Number(payload.factor ?? 0.25);
        currentShocks.liquidityFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
        break;
      }
      case 'ROLLBACK': {
        const targetMinute = Number(payload.targetMinute ?? 0);
        await this.rollbackToMinute(room, targetMinute);
        return { success: true, message: `Rollback effectué à la minute ${targetMinute}.` };
      }
      default:
        // NEWS et WHALE : diffusés aux participants sans modifier la mécanique des prix.
        break;
    }

    this.marketSource.setShocks(room.id, currentShocks);
    return { success: true, event };
  }

  /** Change la vitesse de relecture en conservant l'instant de simulation atteint. */
  async setPlaybackSpeed(room: GameRoom, speed: number): Promise<GameRoom> {
    if (!(speed > 0) || speed > 1000) {
      throw new BadRequestException('La vitesse de relecture doit être comprise entre 0,1x et 1000x.');
    }
    room.simElapsedSeconds = this.calculateCurrentElapsedSeconds(room);
    room.playbackSpeed = String(Math.round(speed * 10_000) / 10_000);
    room.totalSimSeconds = recomputeTotalSimSeconds(room);
    room.simElapsedSeconds = Math.min(room.simElapsedSeconds, room.totalSimSeconds);
    if (room.status === 'running') room.startedAt = new Date();
    return this.rooms.save(room);
  }

  /** Déplace le curseur de la séance vers une seconde de simulation donnée. */
  async seekTo(room: GameRoom, seconds: number): Promise<GameRoom> {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new BadRequestException('Instant cible invalide.');
    }
    const total = totalSimSeconds(room);
    room.simElapsedSeconds = Math.max(0, Math.min(Math.round(seconds), total));
    if (room.status === 'running') room.startedAt = new Date();
    return this.rooms.save(room);
  }

  /**
   * Rollback vers une minute donnée : purge les exécutions postérieures et
   * recalcule le cash et les positions de chaque participant à cet instant.
   */
  async rollbackToMinute(room: GameRoom, targetMinute: number) {
    const targetSeconds = Math.max(0, Math.round(targetMinute * 60));
    const config = readRoomConfig(room);

    // Rejoue les chocs encore antérieurs à la minute cible.
    const remainingEvents = await this.events.find({
      where: { roomId: room.id },
      order: { simElapsedSeconds: 'ASC' },
    });
    const shocks = { priceOffset: 0, spreadMultiplier: 1.0, liquidityFactor: 1.0 };
    for (const ev of remainingEvents) {
      if (ev.simElapsedSeconds > targetSeconds) continue;
      if (ev.type === 'PRICE_SHOCK') {
        const delta = Number(ev.payload?.priceDelta ?? -50);
        shocks.priceOffset += Number.isFinite(delta) ? delta : 0;
      } else if (ev.type === 'SPREAD_SHOCK') {
        shocks.spreadMultiplier = Number(ev.payload?.multiplier ?? 4.0);
      } else if (ev.type === 'LIQUIDITY_SHOCK') {
        shocks.liquidityFactor = Number(ev.payload?.factor ?? 0.25);
      }
    }
    this.marketSource.setShocks(room.id, shocks);

    return this.dataSource.transaction(async (manager) => {
      room.simElapsedSeconds = Math.min(targetSeconds, totalSimSeconds(room));
      if (room.status === 'running') {
        room.startedAt = new Date();
      }
      await manager.getRepository(GameRoom).save(room);

      await manager.getRepository(SimulationTrade)
        .createQueryBuilder()
        .delete()
        .where('roomId = :roomId AND simMinute > :targetMinute', { roomId: room.id, targetMinute })
        .execute();

      const allRoomTrades = await manager.getRepository(SimulationTrade).find({
        where: { roomId: room.id },
        order: { executedAt: 'ASC' },
      });

      const userTrades = new Map<string, SimulationTrade[]>();
      for (const tr of allRoomTrades) {
        const list = userTrades.get(tr.userId) ?? [];
        list.push(tr);
        userTrades.set(tr.userId, list);
      }

      const allPortfolios = await manager.getRepository(SimulationPortfolio).find({ where: { roomId: room.id } });
      for (const pf of allPortfolios) {
        // Rejoue les trades conservés dans le modèle de marge de la salle.
        let cash = config.initialCapital;
        const perSymbol = new Map<string, { qty: number; average: number }>();

        for (const t of userTrades.get(pf.userId) ?? []) {
          const entry = perSymbol.get(t.symbol) ?? { qty: 0, average: 0 };
          const fill = applyFill({
            side: t.side,
            quantity: Number(t.quantity),
            price: Number(t.price),
            commissionPercent: config.commissionPercent,
            leverage: config.leverage,
            held: entry.qty,
            averagePrice: entry.average,
            cash,
          });
          cash = Math.max(0, fill.cash);
          entry.qty = fill.quantity;
          entry.average = fill.averagePrice;
          perSymbol.set(t.symbol, entry);
        }

        pf.cash = cash.toFixed(2);
        await manager.getRepository(SimulationPortfolio).save(pf);

        const positions = await manager.getRepository(SimulationPosition).find({
          where: { portfolioId: pf.id },
        });
        for (const pos of positions) {
          const entry = perSymbol.get(pos.symbol);
          pos.quantity = (entry?.qty ?? 0).toFixed(6);
          pos.averagePrice = Math.abs(entry?.average ?? 0).toFixed(4);
          await manager.getRepository(SimulationPosition).save(pos);
        }
      }

      await manager.getRepository(SimulationOrder)
        .createQueryBuilder()
        .delete()
        .where('roomId = :roomId AND createdAt > :cutoff', {
          roomId: room.id,
          cutoff: new Date(Date.now() - (this.calculateCurrentElapsedSeconds(room) - targetSeconds) * 1000),
        })
        .execute();
    });
  }

  private assertRoomSymbol(room: GameRoom, symbol?: string): string {
    const symbols = this.marketSource.roomSymbols(room);
    const requested = symbol || symbols[0];
    if (!symbols.includes(requested)) {
      throw new BadRequestException(
        `Actif ${requested} non négociable dans cette salle. Actifs disponibles : ${symbols.join(', ')}.`,
      );
    }
    return requested;
  }
}

// -----------------------------------------------------------------------------
// Configuration de salle, modèle de marge et règles de risque
// -----------------------------------------------------------------------------

export interface RoomTradingConfig {
  initialCapital: number;
  spreadMultiplier: number;
  commissionPercent: number;
  leverage: number;
  allowShortSelling: boolean;
  maxExposure: number | null;
  riskLimitPercent: number | null;
}

export function readRoomConfig(room: GameRoom): RoomTradingConfig {
  return {
    initialCapital: Number(room.initialCapital ?? 100000) || 100000,
    spreadMultiplier: Number(room.spreadMultiplier ?? 1) || 1,
    commissionPercent: Math.max(0, Number(room.commissionPercent ?? 0) || 0),
    leverage: Math.max(1, Number(room.leverage ?? 1) || 1),
    allowShortSelling: Boolean(room.allowShortSelling),
    maxExposure: room.maxExposure === null || room.maxExposure === undefined ? null : Number(room.maxExposure),
    riskLimitPercent:
      room.riskLimitPercent === null || room.riskLimitPercent === undefined ? null : Number(room.riskLimitPercent),
  };
}

export interface FillInput {
  side: SimOrderSide;
  quantity: number;
  price: number;
  commissionPercent: number;
  leverage: number;
  /** Quantité actuellement détenue (négative = position courte). */
  held: number;
  averagePrice: number;
  cash: number;
}

export interface FillResult {
  cash: number;
  quantity: number;
  averagePrice: number;
  commission: number;
  /** Marge immobilisée à l'ouverture, ou libérée à la clôture. */
  margin: number;
  realizedPnl: number;
}

/**
 * Comptabilité d'une exécution sur marge.
 *
 * À l'ouverture, seule la marge (notionnel / levier) est immobilisée ; à la
 * clôture, la marge est restituée et le P&L réalisé est crédité. Avec un levier
 * de 1 et sans commission, on retrouve exactement un règlement au comptant.
 */
export function applyFill(input: FillInput): FillResult {
  const leverage = Math.max(1, input.leverage);
  const commission = round2((input.quantity * input.price * input.commissionPercent) / 100);

  let cash = input.cash - commission;
  let held = input.held;
  let average = input.averagePrice;
  let remaining = input.quantity;
  let realizedPnl = 0;
  let margin = 0;
  let released = 0;

  const closes = (input.side === 'buy' && held < -1e-9) || (input.side === 'sell' && held > 1e-9);
  if (closes) {
    const closeQty = Math.min(remaining, Math.abs(held));
    realizedPnl = input.side === 'buy' ? closeQty * (average - input.price) : closeQty * (input.price - average);
    released = (closeQty * average) / leverage;
    cash += released + realizedPnl;
    held = input.side === 'buy' ? held + closeQty : held - closeQty;
    if (Math.abs(held) < 1e-9) {
      held = 0;
      average = 0;
    }
    remaining -= closeQty;
  }

  if (remaining > 1e-9) {
    margin = (remaining * input.price) / leverage;
    cash -= margin;
    if (Math.abs(held) < 1e-9) {
      average = input.price;
    } else {
      const totalQty = Math.abs(held) + remaining;
      average = (Math.abs(held) * average + remaining * input.price) / totalQty;
    }
    held = input.side === 'buy' ? held + remaining : held - remaining;
  }

  return { cash, quantity: held, averagePrice: average, commission, margin: margin - released, realizedPnl };
}

function assertRiskWithinLimit(params: {
  symbol: string;
  side: SimOrderSide;
  quantity: number;
  entryPrice: number;
  stopLoss?: number;
  riskLimitPercent: number;
  initialCapital: number;
  currency: string;
}): void {
  const { symbol, side, quantity, entryPrice, stopLoss, riskLimitPercent, initialCapital, currency } = params;
  const maxLoss = (initialCapital * riskLimitPercent) / 100;

  if (!stopLoss || stopLoss <= 0) {
    throw new BadRequestException(
      `Cette salle limite le risque à ${riskLimitPercent} % du capital (${round2(maxLoss)} ${currency}) : un Stop-Loss est obligatoire pour ouvrir une position.`,
    );
  }

  const lossPerUnit = side === 'buy' ? entryPrice - stopLoss : stopLoss - entryPrice;
  if (lossPerUnit <= 0) {
    throw new BadRequestException(
      side === 'buy'
        ? 'Le Stop-Loss d’un achat doit être inférieur au prix d’entrée.'
        : 'Le Stop-Loss d’une vente doit être supérieur au prix d’entrée.',
    );
  }

  const risk = lossPerUnit * quantity;
  if (risk > maxLoss + 1e-6) {
    throw new BadRequestException(
      `Risque de ${round2(risk)} ${currency} sur ${symbol} supérieur à la limite de la salle (${round2(maxLoss)} ${currency}). Réduisez la quantité ou resserrez le Stop-Loss.`,
    );
  }
}

/** Durée totale de simulation cohérente avec la source et la vitesse demandée. */
export function recomputeTotalSimSeconds(room: GameRoom): number {
  if (room.sourceMode === 'scenario' || room.sourceMode === 'historical' || room.sourceMode === 'csv') {
    return totalSimSeconds(room);
  }
  const durationMinutes = Number(room.durationMinutes) || 30;
  if (room.sourceMode === 'live') return durationMinutes * 60;
  return Math.round(durationMinutes * 60 * playbackSpeed(room));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatQty(qty: number): string {
  return String(Math.round(qty * 1000) / 1000);
}
