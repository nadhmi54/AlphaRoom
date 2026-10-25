import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Order } from '../order-book/order.entity.js';
import { TradeExecution } from './trade-execution.entity.js';
import { TradingPortfolio } from './portfolio.entity.js';
import { TradingPosition } from './position.entity.js';
import { TradingService } from './trading.service.js';

const OWNER_ID = '0b22e972-475d-4254-a039-060e8e2a4925';
const PORTFOLIO_ID = '1ab4673d-beb4-42b2-acfc-a897b33ceedd';

function makePortfolio(over: Partial<TradingPortfolio> = {}): TradingPortfolio {
  return Object.assign(new TradingPortfolio(), {
    id: PORTFOLIO_ID,
    ownerId: OWNER_ID,
    cash: '29814.60',
    initialCash: '100000.00',
    createdAt: new Date('2026-10-24T17:54:49.000Z'),
    updatedAt: new Date('2026-10-24T18:09:00.000Z'),
    ...over,
  });
}

function setup() {
  const portfolio = makePortfolio();
  const qb = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
  };

  const portfolios = {
    findOne: vi.fn().mockResolvedValue(portfolio),
    create: vi.fn((x: Partial<TradingPortfolio>) => makePortfolio(x)),
    save: vi.fn(async (x: TradingPortfolio) => x),
  };
  const positions = {
    find: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue({ affected: 1 }),
  };
  const executions = {
    find: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue({ affected: 12 }),
    createQueryBuilder: vi.fn(() => qb),
  };
  const orders = {
    delete: vi.fn().mockResolvedValue({ affected: 3 }),
  };
  const marks = {
    find: vi.fn().mockResolvedValue([]),
  };

  const manager = {
    getRepository: vi.fn((entity: unknown) => {
      if (entity === TradingPortfolio) {
        return { findOne: vi.fn().mockResolvedValue(portfolio), save: portfolios.save };
      }
      if (entity === TradingPosition) return { delete: positions.delete };
      if (entity === TradeExecution) return { delete: executions.delete };
      if (entity === Order) return { delete: orders.delete };
      throw new Error('repository inattendu');
    }),
  };
  const dataSource = {
    transaction: vi.fn(async (callback: (m: typeof manager) => Promise<unknown>) =>
      callback(manager),
    ),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new TradingService(dataSource as any, portfolios as any, positions as any, executions as any, marks as any);
  return { service, portfolios, positions, executions, orders, manager, dataSource, portfolio };
}

describe('TradingService.resetPortfolio', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it('efface les positions et exécutions du compte', async () => {
    await ctx.service.resetPortfolio(OWNER_ID);

    expect(ctx.executions.delete).toHaveBeenCalledWith({ portfolioId: PORTFOLIO_ID });
    expect(ctx.positions.delete).toHaveBeenCalledWith({ portfolioId: PORTFOLIO_ID });
  });

  it('supprime aussi les ordres en attente dans le carnet', async () => {
    await ctx.service.resetPortfolio(OWNER_ID);

    // Sinon le cash réservé par un achat limite resterait bloqué.
    expect(ctx.orders.delete).toHaveBeenCalledWith({ ownerId: OWNER_ID });
  });

  it('remet le cash et le capital initial à 100 000 USD', async () => {
    await ctx.service.resetPortfolio(OWNER_ID);

    expect(ctx.portfolio.cash).toBe('100000.00');
    expect(ctx.portfolio.initialCash).toBe('100000.00');
    expect(ctx.portfolios.save).toHaveBeenCalledTimes(1);
  });

  it('renvoie un Dashboard vide avec un rendement nul', async () => {
    const result = await ctx.service.resetPortfolio(OWNER_ID);

    expect(result.portfolio).toMatchObject({
      cash: 100000,
      initialCash: 100000,
      marketValue: 0,
      totalValue: 100000,
      returnAmount: 0,
      returnPercent: 0,
    });
    expect(result.positions).toEqual([]);
    expect(result.executions).toEqual([]);
    expect(result.history.total).toBe(0);
    expect(result.stats.totalOrders).toBe(0);
    expect(result.equityCurve).toHaveLength(1);
    expect(result.equityCurve[0].value).toBe(100000);
  });

  it('fonctionne dans une transaction avec verrou pessimiste', async () => {
    await ctx.service.resetPortfolio(OWNER_ID);

    expect(ctx.dataSource.transaction).toHaveBeenCalledTimes(1);
    const portfolioRepo = ctx.manager.getRepository.mock.results[0].value;
    expect(portfolioRepo.findOne).toHaveBeenCalledWith({
      where: { id: PORTFOLIO_ID },
      lock: { mode: 'pessimistic_write' },
    });
  });
});
