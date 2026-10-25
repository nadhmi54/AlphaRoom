import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type Repository } from 'typeorm';
import { TradingPortfolio } from './portfolio.entity.js';
import { TradingPosition } from './position.entity.js';
import { TradeExecution } from './trade-execution.entity.js';
import type { PlaceOrderDto } from './dto/place-order.dto.js';
import type { PortfolioHistoryQueryDto } from './dto/portfolio-history-query.dto.js';
import { findMarketAsset, MARKET_ASSETS } from './market-assets.js';

const STARTING_CASH = '100000.00';

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
  ) {}

  getAssets() {
    return MARKET_ASSETS;
  }

  async getPortfolio(ownerId: string, filters: PortfolioHistoryQueryDto) {
    const portfolio = await this.getOrCreatePortfolio(ownerId);
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

    const positionViews = positions.map((position) => this.positionView(position));
    const marketValue = positionViews.reduce((sum, item) => sum + item.marketValue, 0);
    const initialCash = Number(portfolio.initialCash);
    const performance = this.calculatePerformance(
      allExecutions,
      initialCash,
      portfolio.createdAt,
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

  async placeOrder(ownerId: string, dto: PlaceOrderDto) {
    const asset = findMarketAsset(dto.symbol);
    if (!asset) throw new BadRequestException('Actif non disponible dans la simulation.');

    const existing = await this.executions.findOne({
      where: { ownerId, requestId: dto.requestId },
    });
    if (existing) return { ...this.executionView(existing), duplicate: true };

    const portfolio = await this.getOrCreatePortfolio(ownerId);
    const quantity = Number(dto.quantity);
    const amount = this.money(asset.price * quantity);
    if (amount < 0.01)
      throw new BadRequestException('Le montant minimum d’un ordre est de 0,01 USD.');

    return this.dataSource.transaction(async (manager) => {
      const locked = await manager.getRepository(TradingPortfolio).findOne({
        where: { id: portfolio.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException('Portefeuille introuvable.');

      const priorExecution = await manager.getRepository(TradeExecution).findOne({
        where: { ownerId, requestId: dto.requestId },
      });
      if (priorExecution)
        return { ...this.executionView(priorExecution), duplicate: true };

      const positionRepo = manager.getRepository(TradingPosition);
      let position = await positionRepo.findOne({
        where: { portfolioId: locked.id, symbol: dto.symbol },
      });
      const heldQuantity = Number(position?.quantity ?? 0);
      const cash = Number(locked.cash);
      if (dto.side === 'buy' && amount > cash) {
        throw new BadRequestException(
          `Solde insuffisant : il manque ${this.money(amount - cash).toFixed(2)} USD.`,
        );
      }
      if (dto.side === 'sell' && quantity > heldQuantity) {
        throw new BadRequestException(
          `Quantité insuffisante : vous détenez ${heldQuantity} ${asset.unit}.`,
        );
      }

      if (dto.side === 'buy') {
        const newQuantity = heldQuantity + quantity;
        const newAverage =
          (heldQuantity * Number(position?.averagePrice ?? 0) + amount) / newQuantity;
        if (!position)
          position = positionRepo.create({ portfolioId: locked.id, symbol: dto.symbol });
        position.quantity = newQuantity.toFixed(6);
        position.averagePrice = newAverage.toFixed(4);
        locked.cash = this.money(cash - amount).toFixed(2);
      } else {
        const remaining = heldQuantity - quantity;
        position!.quantity =
          Math.abs(remaining) < 0.0000005 ? '0.000000' : remaining.toFixed(6);
        locked.cash = this.money(cash + amount).toFixed(2);
      }

      const execution = manager.getRepository(TradeExecution).create({
        ownerId,
        portfolioId: locked.id,
        requestId: dto.requestId,
        symbol: dto.symbol,
        side: dto.side,
        quantity: quantity.toFixed(6),
        price: asset.price.toFixed(4),
        amount: amount.toFixed(2),
      });
      await manager.getRepository(TradeExecution).save(execution);
      await positionRepo.save(position!);
      await manager.getRepository(TradingPortfolio).save(locked);
      return { ...this.executionView(execution), duplicate: false };
    });
  }

  async getQuote(symbol?: string) {
    if (!symbol) return MARKET_ASSETS;
    const asset = findMarketAsset(symbol);
    if (!asset) throw new NotFoundException('Actif introuvable.');
    return asset;
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

  private positionView(position: TradingPosition) {
    const asset = findMarketAsset(position.symbol);
    const quantity = Number(position.quantity);
    const averagePrice = Number(position.averagePrice);
    const currentPrice = asset?.price ?? 0;
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
        return sum + item.quantity * (findMarketAsset(symbol)?.price ?? 0);
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
