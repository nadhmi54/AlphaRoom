import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { TradingPortfolio } from '../trading/portfolio.entity.js';
import { TradingPosition } from '../trading/position.entity.js';
import { TradeExecution } from '../trading/trade-execution.entity.js';
import type { PositionStatusFilter } from './dto/positions-query.dto.js';
import {
  buildPositionCycles,
  computeAllocation,
  type ExecutionRecord,
  type Holding,
  type PositionCycle,
  roundMoney,
  valuePosition,
} from './portfolio-math.js';
import { PriceSource } from './price-source.js';

const CURRENCY = 'USD';

export interface OpenPositionView {
  symbol: string;
  quantity: number;
  averagePrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  currentPrice: number;
  /** Faux si l'actif n'a pas de cotation : la valeur est alors affichée à 0. */
  priceAvailable: boolean;
  marketValue: number;
  costBasis: number;
  unrealizedPnl: number;
  unrealizedPercent: number;
  /** Part de la valeur totale du portefeuille (cash inclus), en %. */
  weightPercent: number;
  /** Déjà encaissé sur ce cycle par des ventes partielles. */
  realizedPnl: number;
  openedAt: Date | null;
}

export interface PositionsSummary {
  openCount: number;
  closedCount: number;
  /** Valeur des positions ouvertes. */
  marketValue: number;
  unrealizedPnl: number;
  /** P&L encaissé sur tous les cycles (fermés et ouverts). */
  realizedPnl: number;
  /** Cycles fermés gagnants / perdants (les cycles à 0 ne comptent dans aucun). */
  winningCycles: number;
  losingCycles: number;
}

@Injectable()
export class PositionsService {
  constructor(
    @InjectRepository(TradingPortfolio)
    private readonly portfolios: Repository<TradingPortfolio>,
    @InjectRepository(TradingPosition)
    private readonly positions: Repository<TradingPosition>,
    @InjectRepository(TradeExecution)
    private readonly executions: Repository<TradeExecution>,
    @Inject(PriceSource) private readonly prices: PriceSource,
  ) {}

  /** Positions ouvertes et/ou fermées du portefeuille d'un utilisateur. */
  async getPositions(ownerId: string, status: PositionStatusFilter = 'all') {
    const state = await this.loadState(ownerId);
    const prices = state.prices;
    const allocation = computeAllocation(state.cash, state.holdings);
    const weightBySymbol = new Map(
      allocation.slices.map((slice) => [slice.key, slice.weightPercent]),
    );

    const openCycles = new Map(
      state.cycles.filter((c) => c.status === 'open').map((c) => [c.symbol, c]),
    );
    const open: OpenPositionView[] = state.rows
      .filter((row) => Number(row.quantity) > 0)
      .map((row) => {
        const price = prices.get(row.symbol);
        const valuation = valuePosition(
          Number(row.quantity),
          Number(row.averagePrice),
          price ?? 0,
        );
        const cycle = openCycles.get(row.symbol);
        return {
          symbol: row.symbol,
          ...valuation,
          stopLoss: row.stopLoss === null ? null : Number(row.stopLoss),
          takeProfit: row.takeProfit === null ? null : Number(row.takeProfit),
          // Sans cotation, on n'invente pas de perte : le latent reste à 0.
          unrealizedPnl: price === undefined ? 0 : valuation.unrealizedPnl,
          unrealizedPercent: price === undefined ? 0 : valuation.unrealizedPercent,
          priceAvailable: price !== undefined,
          weightPercent: weightBySymbol.get(row.symbol) ?? 0,
          realizedPnl: cycle?.realizedPnl ?? 0,
          openedAt: cycle?.openedAt ?? null,
        };
      })
      .sort((a, b) => b.marketValue - a.marketValue || a.symbol.localeCompare(b.symbol));

    const closed = state.cycles.filter((cycle) => cycle.status === 'closed');
    const summary: PositionsSummary = {
      openCount: open.length,
      closedCount: closed.length,
      marketValue: roundMoney(open.reduce((sum, p) => sum + p.marketValue, 0)),
      unrealizedPnl: roundMoney(open.reduce((sum, p) => sum + p.unrealizedPnl, 0)),
      realizedPnl: roundMoney(state.cycles.reduce((sum, c) => sum + c.realizedPnl, 0)),
      winningCycles: closed.filter((c) => c.realizedPnl > 0).length,
      losingCycles: closed.filter((c) => c.realizedPnl < 0).length,
    };

    return {
      currency: CURRENCY,
      summary,
      ...(status !== 'closed' ? { open } : {}),
      ...(status !== 'open' ? { closed } : {}),
    };
  }

  /** Répartition du portefeuille : cash + poids de chaque actif + alerte. */
  async getAllocation(ownerId: string) {
    const state = await this.loadState(ownerId);
    return { currency: CURRENCY, ...computeAllocation(state.cash, state.holdings) };
  }

  async updateProtection(
    ownerId: string,
    symbol: string,
    changes: { stopLoss?: number | null; takeProfit?: number | null },
  ) {
    if (changes.stopLoss === undefined && changes.takeProfit === undefined) {
      throw new BadRequestException('Indiquez au moins un seuil à modifier.');
    }

    const portfolio = await this.portfolios.findOne({ where: { ownerId } });
    if (!portfolio) throw new NotFoundException('Portefeuille introuvable.');
    const position = await this.positions.findOne({ where: { portfolioId: portfolio.id, symbol } });
    if (!position || Number(position.quantity) <= 0) {
      throw new NotFoundException('Position ouverte introuvable.');
    }

    const currentPrice = (await this.prices.getPrices()).get(symbol);
    if (currentPrice === undefined) throw new NotFoundException('Cours indisponible pour cet actif.');

    const stopLoss = changes.stopLoss === undefined
      ? position.stopLoss === null ? null : Number(position.stopLoss)
      : changes.stopLoss;
    const takeProfit = changes.takeProfit === undefined
      ? position.takeProfit === null ? null : Number(position.takeProfit)
      : changes.takeProfit;

    if (stopLoss !== null && stopLoss >= currentPrice) {
      throw new BadRequestException('Le stop-loss doit être inférieur au cours actuel.');
    }
    if (takeProfit !== null && takeProfit <= currentPrice) {
      throw new BadRequestException('Le take-profit doit être supérieur au cours actuel.');
    }

    position.stopLoss = stopLoss === null ? null : stopLoss.toFixed(4);
    position.takeProfit = takeProfit === null ? null : takeProfit.toFixed(4);
    await this.positions.save(position);
    return {
      symbol,
      stopLoss: stopLoss === null ? null : Number(position.stopLoss),
      takeProfit: takeProfit === null ? null : Number(position.takeProfit),
    };
  }

  /**
   * Lecture seule : ne crée jamais de portefeuille (c'est le rôle du module
   * de trading). Un utilisateur sans portefeuille obtient des listes vides.
   */
  private async loadState(ownerId: string) {
    const portfolio = await this.portfolios.findOne({ where: { ownerId } });
    if (!portfolio) {
      return {
        cash: 0,
        prices: new Map<string, number>(),
        rows: [] as TradingPosition[],
        holdings: [] as Holding[],
        cycles: [] as PositionCycle[],
      };
    }
    const [prices, rows, executions] = await Promise.all([
      this.prices.getPrices(),
      this.positions.find({ where: { portfolioId: portfolio.id }, order: { symbol: 'ASC' } }),
      this.executions.find({
        where: { portfolioId: portfolio.id },
        order: { executedAt: 'ASC', id: 'ASC' },
      }),
    ]);

    const holdings: Holding[] = rows
      .filter((row) => Number(row.quantity) > 0)
      .map((row) => ({
        symbol: row.symbol,
        quantity: Number(row.quantity),
        price: prices.get(row.symbol) ?? 0,
      }));
    const records: ExecutionRecord[] = executions.map((execution) => ({
      id: execution.id,
      symbol: execution.symbol,
      side: execution.side,
      quantity: Number(execution.quantity),
      price: Number(execution.price),
      amount: Number(execution.amount),
      executedAt: execution.executedAt,
    }));

    return {
      cash: Number(portfolio.cash),
      prices,
      rows,
      holdings,
      cycles: buildPositionCycles(records),
    };
  }
}
