import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type Repository } from 'typeorm';
import { Order } from '../order-book/order.entity.js';
import { OrderBookMark } from '../order-book/order-book-mark.entity.js';
import { TradingPortfolio } from './portfolio.entity.js';
import { TradingPosition } from './position.entity.js';
import { TradeExecution } from './trade-execution.entity.js';
import type { PortfolioHistoryQueryDto } from './dto/portfolio-history-query.dto.js';
import { findMarketAsset, MARKET_ASSETS } from './market-assets.js';

const STARTING_CASH = '100000.00';

/** Exécution produite par le carnet d'ordres, déjà valorisée. */
export interface FillInput {
  ownerId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  amount: number;
  requestId: string;
  orderId: string;
}

@Injectable()
export class TradingService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TradingPortfolio)
    private readonly portfolios: Repository<TradingPortfolio>,
    @InjectRepository(TradingPosition)
    private readonly positions: Repository<TradingPosition>,
    @InjectRepository(TradeExecution)
    private readonly executions: Repository<TradeExecution>,
    @InjectRepository(OrderBookMark)
    private readonly marks: Repository<OrderBookMark>,
  ) {}

  /**
   * Cours de chaque actif : dernier prix exécuté dans le carnet s'il existe,
   * prix de démonstration sinon (carnet encore vide).
   */
  private async priceMap() {
    const prices = new Map<string, number>(
      MARKET_ASSETS.map((asset) => [asset.symbol, asset.price]),
    );
    for (const mark of await this.marks.find()) {
      prices.set(mark.symbol, Number(mark.lastPrice));
    }
    return prices;
  }

  async getAssets() {
    const prices = await this.priceMap();
    return MARKET_ASSETS.map((asset) => ({
      ...asset,
      price: prices.get(asset.symbol) ?? asset.price,
      referencePrice: asset.price,
    }));
  }

  async getPortfolio(ownerId: string, filters: PortfolioHistoryQueryDto) {
    const portfolio = await this.getOrCreatePortfolio(ownerId);
    const prices = await this.priceMap();
    const positions = await this.positions.find({
      where: { portfolioId: portfolio.id },
      order: { symbol: 'ASC' },
    });
    const allExecutions = await this.executions.find({
      where: { portfolioId: portfolio.id },
      order: { executedAt: 'ASC', id: 'ASC' },
    });
    const query = this.executions
      .createQueryBuilder('execution')
      .where('execution.portfolioId = :portfolioId', { portfolioId: portfolio.id });

    if (filters.symbol) query.andWhere('execution.symbol = :symbol', { symbol: filters.symbol });
    if (filters.side) query.andWhere('execution.side = :side', { side: filters.side });
    if (filters.from) {
      query.andWhere('execution.executedAt >= :from', {
        from: this.dateBoundary(filters.from, false),
      });
    }
    if (filters.to) {
      query.andWhere('execution.executedAt < :to', {
        to: this.dateBoundary(filters.to, true),
      });
    }

    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const [history, historyTotal] = await query
      .orderBy('execution.executedAt', 'DESC')
      .addOrderBy('execution.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    const positionViews = positions.map((position) => this.positionView(position, prices));
    const marketValue = positionViews.reduce((sum, item) => sum + item.marketValue, 0);
    const initialCash = Number(portfolio.initialCash);
    const performance = this.calculatePerformance(
      allExecutions,
      initialCash,
      portfolio.createdAt,
      prices,
    );
    const totalValue = Number(portfolio.cash) + marketValue;

    return {
      currency: 'USD',
      portfolio: {
        id: portfolio.id,
        cash: Number(portfolio.cash),
        initialCash,
        marketValue: this.money(marketValue),
        totalValue: this.money(totalValue),
        returnAmount: this.money(totalValue - initialCash),
        returnPercent: initialCash
          ? this.money(((totalValue - initialCash) / initialCash) * 100)
          : 0,
      },
      positions: positionViews,
      executions: history.map((execution) => ({
        ...this.executionView(execution),
        realizedPnl: performance.realizedByExecution.get(execution.id) ?? 0,
      })),
      history: { page, pageSize, total: historyTotal, pages: Math.ceil(historyTotal / pageSize) },
      stats: performance.stats,
      equityCurve: performance.equityCurve,
    };
  }

  /**
   * Comptabilise **une** exécution décidée par le carnet d'ordres : cash,
   * position et ligne d'historique, dans la transaction fournie par l'appelant.
   *
   * C'est le seul chemin d'écriture des exécutions : le carnet décide qui
   * s'apparie et à quel prix, `TradingService` tient les comptes. M1 (cash),
   * M2 (positions) et M5 (historique) lisent tous `trade_executions`.
   */
  async applyFill(manager: EntityManager, fill: FillInput): Promise<TradeExecution> {
    const portfolio = await this.lockPortfolio(manager, fill.ownerId);
    const positionRepo = manager.getRepository(TradingPosition);
    let position = await positionRepo.findOne({
      where: { portfolioId: portfolio.id, symbol: fill.symbol },
    });

    const heldQuantity = Number(position?.quantity ?? 0);
    const cash = Number(portfolio.cash);
    const quantity = Number(fill.quantity);
    const amount = Number(fill.amount);

    if (fill.side === 'buy') {
      if (amount > cash) {
        throw new BadRequestException(
          `Solde insuffisant : il manque ${this.money(amount - cash).toFixed(2)} USD.`,
        );
      }
      const newQuantity = heldQuantity + quantity;
      const newAverage =
        (heldQuantity * Number(position?.averagePrice ?? 0) + amount) / newQuantity;
      if (!position) {
        position = positionRepo.create({ portfolioId: portfolio.id, symbol: fill.symbol });
      }
      position.quantity = newQuantity.toFixed(6);
      position.averagePrice = newAverage.toFixed(4);
      portfolio.cash = this.money(cash - amount).toFixed(2);
    } else {
      if (quantity > heldQuantity + 0.0000005) {
        throw new BadRequestException(
          `Quantité insuffisante : vous détenez ${heldQuantity} ${fill.symbol}.`,
        );
      }
      if (!position) throw new BadRequestException('Aucune position à vendre.');
      const remaining = heldQuantity - quantity;
      position.quantity =
        Math.abs(remaining) < 0.0000005 ? '0.000000' : remaining.toFixed(6);
      portfolio.cash = this.money(cash + amount).toFixed(2);
    }

    await positionRepo.save(position);
    await manager.getRepository(TradingPortfolio).save(portfolio);

    const execution = manager.getRepository(TradeExecution).create({
      ownerId: fill.ownerId,
      portfolioId: portfolio.id,
      requestId: fill.requestId,
      orderId: fill.orderId,
      symbol: fill.symbol,
      side: fill.side,
      quantity: quantity.toFixed(6),
      price: Number(fill.price).toFixed(4),
      amount: amount.toFixed(2),
    });
    return manager.getRepository(TradeExecution).save(execution);
  }

  /**
   * Récupère le portefeuille et le verrouille jusqu'à la fin de la transaction
   * (`select ... for update`) : deux exécutions simultanées ne peuvent pas
   * lire le même cash et écraser mutuellement leur mise à jour.
   */
  async lockPortfolio(manager: EntityManager, ownerId: string): Promise<TradingPortfolio> {
    const portfolio = await this.getOrCreatePortfolio(ownerId);
    const locked = await manager.getRepository(TradingPortfolio).findOne({
      where: { id: portfolio.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!locked) throw new NotFoundException('Portefeuille introuvable.');
    return locked;
  }

  /**
   * Remet le compte à zéro : les positions, l'historique d'exécution et les
   * ordres en attente sont effacés et le cash revient au capital initial. Le
   * portefeuille lui-même est conservé (relation 1-1 avec le profil), ce qui
   * évite de recréer la ligne.
   */
  async resetPortfolio(ownerId: string) {
    const portfolio = await this.getOrCreatePortfolio(ownerId);

    await this.dataSource.transaction(async (manager) => {
      const locked = await manager.getRepository(TradingPortfolio).findOne({
        where: { id: portfolio.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException('Portefeuille introuvable.');

      // Les ordres laissés dans le carnet bloqueraient une partie du cash et
      // des quantités du compte remis à zéro.
      await manager.getRepository(Order).delete({ ownerId });
      await manager.getRepository(TradeExecution).delete({ portfolioId: locked.id });
      await manager.getRepository(TradingPosition).delete({ portfolioId: locked.id });

      locked.cash = STARTING_CASH;
      locked.initialCash = STARTING_CASH;
      await manager.getRepository(TradingPortfolio).save(locked);
    });

    return this.getPortfolio(ownerId, { page: 1, limit: 20 } as PortfolioHistoryQueryDto);
  }

  async getQuote(symbol?: string) {
    const prices = await this.priceMap();
    const quote = (asset: (typeof MARKET_ASSETS)[number]) => ({
      ...asset,
      price: prices.get(asset.symbol) ?? asset.price,
      referencePrice: asset.price,
    });
    if (!symbol) return MARKET_ASSETS.map(quote);
    const asset = findMarketAsset(symbol);
    if (!asset) throw new NotFoundException('Actif introuvable.');
    return quote(asset);
  }

  private async getOrCreatePortfolio(ownerId: string) {
    let portfolio = await this.portfolios.findOne({ where: { ownerId } });
    if (portfolio) return portfolio;
    try {
      portfolio = await this.portfolios.save(
        this.portfolios.create({ ownerId, cash: STARTING_CASH, initialCash: STARTING_CASH }),
      );
    } catch {
      portfolio = await this.portfolios.findOne({ where: { ownerId } });
    }
    if (!portfolio) throw new NotFoundException('Impossible de créer le portefeuille.');
    return portfolio;
  }

  private positionView(position: TradingPosition, prices: Map<string, number>) {
    const quantity = Number(position.quantity);
    const averagePrice = Number(position.averagePrice);
    const currentPrice = prices.get(position.symbol) ?? 0;
    const marketValue = this.money(quantity * currentPrice);
    return {
      symbol: position.symbol,
      quantity,
      averagePrice,
      currentPrice,
      marketValue,
      unrealizedPnl: this.money(marketValue - quantity * averagePrice),
    };
  }

  private calculatePerformance(
    executions: TradeExecution[],
    initialCash: number,
    portfolioCreatedAt: Date,
    prices: Map<string, number>,
  ) {
    const holdings = new Map<string, { quantity: number; averagePrice: number }>();
    const realizedByExecution = new Map<string, number>();
    const equityCurve: Array<{ date: Date; value: number }> = [
      { date: portfolioCreatedAt, value: initialCash },
    ];
    let cash = initialCash;
    let realizedPnl = 0;
    let profitableTrades = 0;
    let losingTrades = 0;

    for (const execution of executions) {
      const quantity = Number(execution.quantity);
      const price = Number(execution.price);
      const amount = Number(execution.amount);
      const holding = holdings.get(execution.symbol) ?? { quantity: 0, averagePrice: 0 };

      if (execution.side === 'buy') {
        const nextQuantity = holding.quantity + quantity;
        holding.averagePrice =
          (holding.quantity * holding.averagePrice + amount) / nextQuantity;
        holding.quantity = nextQuantity;
        cash -= amount;
        realizedByExecution.set(execution.id, 0);
      } else {
        const tradePnl = this.money(quantity * (price - holding.averagePrice));
        realizedPnl = this.money(realizedPnl + tradePnl);
        if (tradePnl > 0) profitableTrades += 1;
        if (tradePnl < 0) losingTrades += 1;
        realizedByExecution.set(execution.id, tradePnl);
        holding.quantity = Math.max(0, holding.quantity - quantity);
        if (holding.quantity < 0.0000005) {
          holding.quantity = 0;
          holding.averagePrice = 0;
        }
        cash += amount;
      }
      holdings.set(execution.symbol, holding);

      const holdingsValue = [...holdings.entries()].reduce((sum, [symbol, item]) => {
        return sum + item.quantity * (prices.get(symbol) ?? 0);
      }, 0);
      equityCurve.push({
        date: execution.executedAt,
        value: this.money(cash + holdingsValue),
      });
    }

    const closedTrades = profitableTrades + losingTrades;
    return {
      realizedByExecution,
      stats: {
        totalOrders: executions.length,
        buyOrders: executions.filter((execution) => execution.side === 'buy').length,
        sellOrders: executions.filter((execution) => execution.side === 'sell').length,
        realizedPnl: this.money(realizedPnl),
        profitableTrades,
        losingTrades,
        winRate: closedTrades ? this.money((profitableTrades / closedTrades) * 100) : 0,
      },
      equityCurve,
    };
  }

  private dateBoundary(value: string, exclusiveEnd: boolean) {
    const date = new Date(value);
    if (exclusiveEnd && /^\d{4}-\d{2}-\d{2}$/.test(value))
      date.setUTCDate(date.getUTCDate() + 1);
    return date;
  }

  private executionView(execution: TradeExecution) {
    return {
      id: execution.id,
      symbol: execution.symbol,
      side: execution.side,
      quantity: Number(execution.quantity),
      price: Number(execution.price),
      amount: Number(execution.amount),
      executedAt: execution.executedAt,
    };
  }

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
