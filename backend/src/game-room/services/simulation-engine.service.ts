import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { GameRoom } from '../entities/game-room.entity.js';
import { SimulationPortfolio } from '../entities/sim-portfolio.entity.js';
import { SimulationPosition } from '../entities/sim-position.entity.js';
import { SimulationOrder, SimOrderSide, SimOrderType } from '../entities/sim-order.entity.js';
import { SimulationTrade } from '../entities/sim-trade.entity.js';
import { GameEvent, GameEventType } from '../entities/game-event.entity.js';
import { GameSnapshot } from '../entities/game-snapshot.entity.js';
import {
  calculateScenarioPrice,
  PANIC_TUESDAY_SCENARIO,
} from '../scenario/panic-tuesday.scenario.js';

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

@Injectable()
export class SimulationEngineService {
  private readonly logger = new Logger(SimulationEngineService.name);

  // Décalages manuels appliqués en temps réel par salle via les chocs
  private manualShocks = new Map<string, { priceOffset: number; spreadMultiplier: number; liquidityFactor: number }>();

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(GameRoom) private readonly rooms: Repository<GameRoom>,
    @InjectRepository(SimulationPortfolio) private readonly portfolios: Repository<SimulationPortfolio>,
    @InjectRepository(SimulationPosition) private readonly positions: Repository<SimulationPosition>,
    @InjectRepository(SimulationOrder) private readonly orders: Repository<SimulationOrder>,
    @InjectRepository(SimulationTrade) private readonly trades: Repository<SimulationTrade>,
    @InjectRepository(GameEvent) private readonly events: Repository<GameEvent>,
    @InjectRepository(GameSnapshot) private readonly snapshots: Repository<GameSnapshot>,
  ) {}

  /** Récupère le temps écoulé réel en secondes pour une salle. */
  calculateCurrentElapsedSeconds(room: GameRoom): number {
    if (room.status === 'waiting') return 0;
    if (room.status === 'paused' || room.status === 'finished') {
      return room.simElapsedSeconds;
    }
    if (!room.startedAt) return room.simElapsedSeconds;
    const now = Date.now();
    const started = new Date(room.startedAt).getTime();
    const additional = Math.floor((now - started) / 1000);
    const total = room.simElapsedSeconds + additional;
    const maxSeconds = PANIC_TUESDAY_SCENARIO.durationMinutes * 60;
    return Math.min(total, maxSeconds);
  }

  /** Prix actuel, minute et spread de la simulation pour une salle donnée. */
  getCurrentMarketState(room: GameRoom) {
    const elapsed = this.calculateCurrentElapsedSeconds(room);
    const shocks = this.manualShocks.get(room.id) ?? { priceOffset: 0, spreadMultiplier: 1.0, liquidityFactor: 1.0 };
    const { price, currentMinute, spread } = calculateScenarioPrice(elapsed, shocks.priceOffset);
    return {
      symbol: PANIC_TUESDAY_SCENARIO.symbol,
      price,
      currentMinute: Math.round(currentMinute * 10) / 10,
      elapsedSeconds: elapsed,
      totalSeconds: PANIC_TUESDAY_SCENARIO.durationMinutes * 60,
      spread: Math.round(spread * shocks.spreadMultiplier * 100) / 100,
      shocks,
    };
  }

  /**
   * Génère le carnet d'ordres simulé de la Game Room :
   */
  async getOrderBook(room: GameRoom): Promise<SimOrderBookView> {
    const state = this.getCurrentMarketState(room);
    const halfSpread = state.spread / 2;
    const bestBid = Math.round((state.price - halfSpread) * 100) / 100;
    const bestAsk = Math.round((state.price + halfSpread) * 100) / 100;

    const shocks = this.manualShocks.get(room.id) ?? { liquidityFactor: 1.0 };
    const baseQty = 15.0 * shocks.liquidityFactor;

    // Niveaux simulés par le marché
    const bids: SimBookLevel[] = [];
    const asks: SimBookLevel[] = [];

    const depth = 6;
    for (let i = 0; i < depth; i++) {
      const step = 0.25 * (i + 1);
      const bidPrice = Math.round((bestBid - (i === 0 ? 0 : step)) * 100) / 100;
      const askPrice = Math.round((bestAsk + (i === 0 ? 0 : step)) * 100) / 100;

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

    // Intégrer les ordres limites en attente posés par les participants
    const pendingOrders = await this.orders.find({
      where: { roomId: room.id, status: 'open' },
    });

    for (const ord of pendingOrders) {
      if (!ord.limitPrice) continue;
      const lPrice = Number(ord.limitPrice);
      const rem = Number(ord.remainingQuantity);
      if (ord.side === 'buy') {
        const found = bids.find((b) => Math.abs(b.price - lPrice) < 0.05);
        if (found) {
          found.quantity = Math.round((found.quantity + rem) * 100) / 100;
          found.orders += 1;
        } else if (lPrice <= bestBid) {
          bids.push({ price: lPrice, quantity: rem, orders: 1 });
        }
      } else {
        const found = asks.find((a) => Math.abs(a.price - lPrice) < 0.05);
        if (found) {
          found.quantity = Math.round((found.quantity + rem) * 100) / 100;
          found.orders += 1;
        } else if (lPrice >= bestAsk) {
          asks.push({ price: lPrice, quantity: rem, orders: 1 });
        }
      }
    }

    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);

    return {
      symbol: state.symbol,
      lastPrice: state.price,
      bestBid: bids[0]?.price ?? bestBid,
      bestAsk: asks[0]?.price ?? bestAsk,
      spread: Math.round(((asks[0]?.price ?? bestAsk) - (bids[0]?.price ?? bestBid)) * 100) / 100,
      bids: bids.slice(0, 8),
      asks: asks.slice(0, 8),
      simMinute: state.currentMinute,
    };
  }

  /**
   * Passage d'un ordre dans la Game Room.
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
    const { room, userId, symbol, side, type, quantity, limitPrice, stopLoss, takeProfit } = params;

    if (quantity <= 0) {
      throw new BadRequestException('La quantité doit être supérieure à zéro.');
    }

    const state = this.getCurrentMarketState(room);
    const book = await this.getOrderBook(room);

    return this.dataSource.transaction(async (manager) => {
      let portfolio = await manager.getRepository(SimulationPortfolio).findOne({
        where: { roomId: room.id, userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!portfolio) {
        portfolio = manager.getRepository(SimulationPortfolio).create({
          roomId: room.id,
          userId,
          cash: '100000.00',
          initialCash: '100000.00',
        });
        portfolio = await manager.getRepository(SimulationPortfolio).save(portfolio);
      }

      const positionRepo = manager.getRepository(SimulationPosition);
      let position = await positionRepo.findOne({
        where: { portfolioId: portfolio.id, symbol },
      });

      const currentHeld = Number(position?.quantity ?? 0);
      const currentCash = Number(portfolio.cash);

      if (type === 'market') {
        const executionPrice = side === 'buy' ? book.bestAsk : book.bestBid;
        const totalAmount = Math.round(quantity * executionPrice * 100) / 100;

        if (side === 'buy' && totalAmount > currentCash) {
          throw new BadRequestException(
            `Fonds insuffisants en Game Room : requis ${totalAmount} $, disponible ${currentCash} $.`,
          );
        }

        if (side === 'sell' && quantity > currentHeld + 1e-6) {
          throw new BadRequestException(
            `Quantité insuffisante à vendre : détenu ${currentHeld} ${symbol}.`,
          );
        }

        const order = manager.getRepository(SimulationOrder).create({
          roomId: room.id,
          userId,
          portfolioId: portfolio.id,
          symbol,
          side,
          type: 'market',
          quantity: quantity.toFixed(6),
          filledQuantity: quantity.toFixed(6),
          remainingQuantity: '0',
          averagePrice: executionPrice.toFixed(4),
          status: 'filled',
          stopLoss: stopLoss ? stopLoss.toFixed(4) : null,
          takeProfit: takeProfit ? takeProfit.toFixed(4) : null,
        });
        const savedOrder = await manager.getRepository(SimulationOrder).save(order);

        if (side === 'buy') {
          portfolio.cash = (currentCash - totalAmount).toFixed(2);
          const newQty = currentHeld + quantity;
          const currentAvg = Number(position?.averagePrice ?? 0);
          const newAvg = (currentHeld * currentAvg + totalAmount) / newQty;

          if (!position) {
            position = positionRepo.create({ portfolioId: portfolio.id, symbol });
          }
          position.quantity = newQty.toFixed(6);
          position.averagePrice = newAvg.toFixed(4);
          if (stopLoss) position.stopLoss = stopLoss.toFixed(4);
          if (takeProfit) position.takeProfit = takeProfit.toFixed(4);
        } else {
          portfolio.cash = (currentCash + totalAmount).toFixed(2);
          const remaining = currentHeld - quantity;
          if (!position) throw new BadRequestException('Aucune position à vendre.');
          position.quantity = remaining < 1e-6 ? '0' : remaining.toFixed(6);
          if (remaining < 1e-6) {
            position.averagePrice = '0';
            position.stopLoss = null;
            position.takeProfit = null;
          }
        }

        if (position) await positionRepo.save(position);
        await manager.getRepository(SimulationPortfolio).save(portfolio);

        const trade = manager.getRepository(SimulationTrade).create({
          roomId: room.id,
          userId,
          portfolioId: portfolio.id,
          orderId: savedOrder.id,
          symbol,
          side,
          quantity: quantity.toFixed(6),
          price: executionPrice.toFixed(4),
          amount: totalAmount.toFixed(2),
          simMinute: state.currentMinute,
        });
        await manager.getRepository(SimulationTrade).save(trade);

        return {
          order: savedOrder,
          trade,
          executedPrice: executionPrice,
          portfolioCash: Number(portfolio.cash),
        };
      }

      if (type === 'limit') {
        if (!limitPrice || limitPrice <= 0) {
          throw new BadRequestException('Le prix limite doit être spécifié et supérieur à 0.');
        }

        const willCross = (side === 'buy' && limitPrice >= book.bestAsk) ||
                          (side === 'sell' && limitPrice <= book.bestBid);

        if (willCross) {
          const execPrice = side === 'buy' ? Math.min(limitPrice, book.bestAsk) : Math.max(limitPrice, book.bestBid);
          const totalAmount = Math.round(quantity * execPrice * 100) / 100;

          if (side === 'buy' && totalAmount > currentCash) {
            throw new BadRequestException(`Fonds insuffisants : requis ${totalAmount} $.`);
          }
          if (side === 'sell' && quantity > currentHeld + 1e-6) {
            throw new BadRequestException(`Quantité insuffisante détenue.`);
          }

          const order = manager.getRepository(SimulationOrder).create({
            roomId: room.id,
            userId,
            portfolioId: portfolio.id,
            symbol,
            side,
            type: 'limit',
            limitPrice: limitPrice.toFixed(4),
            quantity: quantity.toFixed(6),
            filledQuantity: quantity.toFixed(6),
            remainingQuantity: '0',
            averagePrice: execPrice.toFixed(4),
            status: 'filled',
            stopLoss: stopLoss ? stopLoss.toFixed(4) : null,
            takeProfit: takeProfit ? takeProfit.toFixed(4) : null,
          });
          const savedOrder = await manager.getRepository(SimulationOrder).save(order);

          if (side === 'buy') {
            portfolio.cash = (currentCash - totalAmount).toFixed(2);
            const newQty = currentHeld + quantity;
            const currentAvg = Number(position?.averagePrice ?? 0);
            const newAvg = (currentHeld * currentAvg + totalAmount) / newQty;
            if (!position) position = positionRepo.create({ portfolioId: portfolio.id, symbol });
            position.quantity = newQty.toFixed(6);
            position.averagePrice = newAvg.toFixed(4);
            if (stopLoss) position.stopLoss = stopLoss.toFixed(4);
            if (takeProfit) position.takeProfit = takeProfit.toFixed(4);
          } else {
            portfolio.cash = (currentCash + totalAmount).toFixed(2);
            const rem = currentHeld - quantity;
            if (position) {
              position.quantity = rem < 1e-6 ? '0' : rem.toFixed(6);
              if (rem < 1e-6) {
                position.averagePrice = '0';
                position.stopLoss = null;
                position.takeProfit = null;
              }
            }
          }

          if (position) await positionRepo.save(position);
          await manager.getRepository(SimulationPortfolio).save(portfolio);

          const trade = manager.getRepository(SimulationTrade).create({
            roomId: room.id,
            userId,
            portfolioId: portfolio.id,
            orderId: savedOrder.id,
            symbol,
            side,
            quantity: quantity.toFixed(6),
            price: execPrice.toFixed(4),
            amount: totalAmount.toFixed(2),
            simMinute: state.currentMinute,
          });
          await manager.getRepository(SimulationTrade).save(trade);

          return { order: savedOrder, trade, executedPrice: execPrice };
        } else {
          if (side === 'buy') {
            const required = Math.round(quantity * limitPrice * 100) / 100;
            if (required > currentCash) {
              throw new BadRequestException(`Cash insuffisant pour poser cet ordre limite.`);
            }
          }
          if (side === 'sell' && quantity > currentHeld + 1e-6) {
            throw new BadRequestException(`Quantité insuffisante pour poser cet ordre de vente.`);
          }

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
            limitPrice: limitPrice.toFixed(4),
            status: 'open',
            stopLoss: stopLoss ? stopLoss.toFixed(4) : null,
            takeProfit: takeProfit ? takeProfit.toFixed(4) : null,
          });
          const savedOrder = await manager.getRepository(SimulationOrder).save(order);
          return { order: savedOrder, trade: null };
        }
      }
    });
  }

  /** Clôture immédiate au marché d'une position d'un participant. */
  async closePosition(room: GameRoom, userId: string, symbol: string) {
    const portfolio = await this.portfolios.findOne({ where: { roomId: room.id, userId } });
    if (!portfolio) throw new BadRequestException('Portefeuille introuvable.');

    const position = await this.positions.findOne({ where: { portfolioId: portfolio.id, symbol } });
    const qty = Number(position?.quantity ?? 0);
    if (!position || qty <= 0) {
      throw new BadRequestException('Aucune position ouverte sur cet actif.');
    }

    return this.placeSimulationOrder({
      room,
      userId,
      symbol,
      side: 'sell',
      type: 'market',
      quantity: qty,
    });
  }

  /**
   * Vérifie et déclenche les ordres limites et Stop-Loss / Take-Profit lorsque le cours bouge.
   */
  async checkTriggeredOrdersAndProtections(room: GameRoom) {
    const state = this.getCurrentMarketState(room);
    const currentPrice = state.price;

    const openOrders = await this.orders.find({
      where: { roomId: room.id, status: 'open' },
    });

    for (const ord of openOrders) {
      if (ord.type === 'limit' && ord.limitPrice) {
        const lPrice = Number(ord.limitPrice);
        const shouldFill = (ord.side === 'buy' && currentPrice <= lPrice) ||
                           (ord.side === 'sell' && currentPrice >= lPrice);
        if (shouldFill) {
          try {
            await this.placeSimulationOrder({
              room,
              userId: ord.userId,
              symbol: ord.symbol,
              side: ord.side,
              type: 'market',
              quantity: Number(ord.remainingQuantity),
            });
            ord.status = 'filled';
            ord.filledQuantity = ord.quantity;
            ord.remainingQuantity = '0';
            ord.averagePrice = currentPrice.toFixed(4);
            await this.orders.save(ord);
          } catch (err) {
            this.logger.error(`Erreur déclenchement ordre limite ${ord.id}:`, err);
          }
        }
      }
    }

    const activePositions = await this.positions.find();
    for (const pos of activePositions) {
      const qty = Number(pos.quantity);
      if (qty <= 0) continue;

      const sl = pos.stopLoss ? Number(pos.stopLoss) : null;
      const tp = pos.takeProfit ? Number(pos.takeProfit) : null;

      const hitSl = sl !== null && currentPrice <= sl;
      const hitTp = tp !== null && currentPrice >= tp;

      if (hitSl || hitTp) {
        const reason = hitSl ? 'Stop-Loss' : 'Take-Profit';
        const pf = await this.portfolios.findOne({ where: { id: pos.portfolioId } });
        if (pf && pf.roomId === room.id) {
          try {
            await this.placeSimulationOrder({
              room,
              userId: pf.userId,
              symbol: pos.symbol,
              side: 'sell',
              type: 'market',
              quantity: qty,
            });
            this.logger.log(`Position clôturée automatiquement (${reason}) pour l'utilisateur ${pf.userId}`);
          } catch (err) {
            this.logger.error(`Erreur clôture protection ${pos.id}:`, err);
          }
        }
      }
    }
  }

  /**
   * Commandes Enseignant (Game Master) :
   */
  async applyGameMasterAction(room: GameRoom, action: {
    type: GameEventType;
    title: string;
    description?: string;
    payload?: Record<string, any>;
  }) {
    const elapsed = this.calculateCurrentElapsedSeconds(room);
    const event = this.events.create({
      roomId: room.id,
      type: action.type,
      title: action.title,
      description: action.description ?? null,
      payload: action.payload ?? {},
      simElapsedSeconds: elapsed,
    });
    await this.events.save(event);

    const currentShocks = this.manualShocks.get(room.id) ?? { priceOffset: 0, spreadMultiplier: 1.0, liquidityFactor: 1.0 };

    switch (action.type) {
      case 'PRICE_SHOCK': {
        const delta = Number(action.payload?.priceDelta ?? (action.payload?.percent ? -2700 * (action.payload.percent / 100) : -50));
        currentShocks.priceOffset += delta;
        break;
      }
      case 'SPREAD_SHOCK': {
        const factor = Number(action.payload?.multiplier ?? 4.0);
        currentShocks.spreadMultiplier = factor;
        break;
      }
      case 'LIQUIDITY_SHOCK': {
        const factor = Number(action.payload?.factor ?? 0.25);
        currentShocks.liquidityFactor = factor;
        break;
      }
      case 'ROLLBACK': {
        const targetMinute = Number(action.payload?.targetMinute ?? 21);
        await this.rollbackToMinute(room, targetMinute);
        return { success: true, message: `Rollback effectué à la minute ${targetMinute}.` };
      }
    }

    this.manualShocks.set(room.id, currentShocks);
    return { success: true, event };
  }

  resetRoomShocks(roomId: string) {
    this.manualShocks.delete(roomId);
  }

  /**
   * Rollback vers une minute donnée (ex: 21).
   */
  async rollbackToMinute(room: GameRoom, targetMinute: number) {
    const targetSeconds = Math.round(targetMinute * 60);

    // Recalculer les chocs actifs à cette minute précise
    const remainingEvents = await this.events.find({
      where: { roomId: room.id },
      order: { simElapsedSeconds: 'ASC' },
    });
    const shocks = { priceOffset: 0, spreadMultiplier: 1.0, liquidityFactor: 1.0 };
    for (const ev of remainingEvents) {
      if (ev.simElapsedSeconds > targetSeconds) continue;
      if (ev.type === 'PRICE_SHOCK') {
        const delta = Number(ev.payload?.priceDelta ?? (ev.payload?.percent ? -2700 * (ev.payload.percent / 100) : -50));
        shocks.priceOffset += delta;
      } else if (ev.type === 'SPREAD_SHOCK') {
        shocks.spreadMultiplier = Number(ev.payload?.multiplier ?? 4.0);
      } else if (ev.type === 'LIQUIDITY_SHOCK') {
        shocks.liquidityFactor = Number(ev.payload?.factor ?? 0.25);
      }
    }
    this.manualShocks.set(room.id, shocks);

    return this.dataSource.transaction(async (manager) => {
      room.simElapsedSeconds = targetSeconds;
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
        let cash = 100000.0;
        let heldQty = 0;
        let totalCost = 0;

        const trades = userTrades.get(pf.userId) ?? [];
        for (const t of trades) {
          const q = Number(t.quantity);
          const a = Number(t.amount);
          if (t.side === 'buy') {
            cash -= a;
            heldQty += q;
            totalCost += a;
          } else {
            cash += a;
            heldQty = Math.max(0, heldQty - q);
          }
        }

        pf.cash = Math.max(0, cash).toFixed(2);
        await manager.getRepository(SimulationPortfolio).save(pf);

        let pos = await manager.getRepository(SimulationPosition).findOne({ where: { portfolioId: pf.id } });
        if (pos) {
          pos.quantity = heldQty.toFixed(6);
          pos.averagePrice = heldQty > 0 ? (totalCost / heldQty).toFixed(4) : '0';
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
}
