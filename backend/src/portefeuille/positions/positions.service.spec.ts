import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { TradingPortfolio } from '../trading/portfolio.entity.js';
import type { TradingPosition } from '../trading/position.entity.js';
import type { TradeExecution } from '../trading/trade-execution.entity.js';
import type { OrderBookMark } from '../order-book/order-book-mark.entity.js';
import { PositionsQueryDto } from './dto/positions-query.dto.js';
import { PositionsService } from './positions.service.js';
import { PriceSource } from './price-source.js';

const PORTFOLIO = { id: 'pf1', ownerId: 'u1', cash: '90000.00' } as TradingPortfolio;

function position(symbol: string, quantity: string, averagePrice: string) {
  return { id: `p-${symbol}`, portfolioId: 'pf1', symbol, quantity, averagePrice } as TradingPosition;
}

function execution(
  id: string,
  symbol: string,
  side: 'buy' | 'sell',
  quantity: number,
  price: number,
  at: string,
) {
  return {
    id,
    portfolioId: 'pf1',
    ownerId: 'u1',
    requestId: id,
    symbol,
    side,
    quantity: quantity.toFixed(6),
    price: price.toFixed(4),
    amount: (Math.round(quantity * price * 100) / 100).toFixed(2),
    executedAt: new Date(at),
  } as TradeExecution;
}

function build(options: {
  portfolio?: TradingPortfolio | null;
  positions?: TradingPosition[];
  executions?: TradeExecution[];
  prices?: Record<string, number>;
}) {
  const portfolios = { findOne: async () => options.portfolio ?? null };
  const positions = { find: async () => options.positions ?? [] };
  const executions = { find: async () => options.executions ?? [] };
  const prices = {
    getPrices: async () => new Map(Object.entries(options.prices ?? {})),
  } as PriceSource;
  return new PositionsService(
    portfolios as never,
    positions as never,
    executions as never,
    prices,
  );
}

describe('PositionsService', () => {
  const prices = { 'AAPL': 260, 'BTC/USD': 70000 };
  const rows = [position('AAPL', '10.000000', '237.2500'), position('BTC/USD', '0.100000', '60000.0000')];
  const history = [
    execution('e1', 'AAPL', 'buy', 20, 237.25, '2026-10-01T10:00:00Z'),
    execution('e2', 'AAPL', 'sell', 10, 260, '2026-10-02T10:00:00Z'),
    execution('e3', 'BTC/USD', 'buy', 0.1, 60000, '2026-10-02T11:00:00Z'),
    execution('e4', 'XAU/USD', 'buy', 1, 2000, '2026-10-03T10:00:00Z'),
    execution('e5', 'XAU/USD', 'sell', 1, 2100, '2026-10-04T10:00:00Z'),
  ];

  it('renvoie les positions ouvertes valorisées et les cycles fermés', async () => {
    const service = build({ portfolio: PORTFOLIO, positions: rows, executions: history, prices });
    const result = await service.getPositions('u1');

    expect(result.currency).toBe('USD');
    expect(result.open).toHaveLength(2);
    const aapl = result.open!.find((p) => p.symbol === 'AAPL')!;
    expect(aapl).toMatchObject({
      quantity: 10,
      averagePrice: 237.25,
      currentPrice: 260,
      marketValue: 2600,
      unrealizedPnl: 227.5,
      realizedPnl: 227.5, // vente partielle déjà encaissée sur ce cycle
      priceAvailable: true,
    });
    expect(result.closed).toHaveLength(1);
    expect(result.closed![0]).toMatchObject({ symbol: 'XAU/USD', realizedPnl: 100, returnPercent: 5 });
  });

  it('calcule le résumé (latent, réalisé, cycles gagnants)', async () => {
    const service = build({ portfolio: PORTFOLIO, positions: rows, executions: history, prices });
    const { summary } = await service.getPositions('u1');
    expect(summary).toMatchObject({
      openCount: 2,
      closedCount: 1,
      marketValue: 9600, // 2 600 + 7 000
      unrealizedPnl: 1227.5, // 227,5 + 1 000
      realizedPnl: 327.5, // 227,5 + 100
      winningCycles: 1,
      losingCycles: 0,
    });
  });

  it('applique le filtre de statut', async () => {
    const service = build({ portfolio: PORTFOLIO, positions: rows, executions: history, prices });
    const onlyOpen = await service.getPositions('u1', 'open');
    expect(onlyOpen).toHaveProperty('open');
    expect(onlyOpen).not.toHaveProperty('closed');
    const onlyClosed = await service.getPositions('u1', 'closed');
    expect(onlyClosed).toHaveProperty('closed');
    expect(onlyClosed).not.toHaveProperty('open');
  });

  it("ajoute le poids de chaque position (cash inclus dans le total)", async () => {
    const service = build({ portfolio: PORTFOLIO, positions: rows, executions: history, prices });
    const { open } = await service.getPositions('u1');
    // total = 90 000 + 2 600 + 7 000 = 99 600
    expect(open!.find((p) => p.symbol === 'BTC/USD')!.weightPercent).toBe(7.03);
    expect(open!.find((p) => p.symbol === 'AAPL')!.weightPercent).toBe(2.61);
  });

  it('affiche un P&L latent nul quand le prix est fixe et égal au prix moyen', async () => {
    const service = build({
      portfolio: PORTFOLIO,
      positions: [position('AAPL', '10.000000', '224.5000')],
      executions: [execution('e1', 'AAPL', 'buy', 10, 224.5, '2026-10-01T10:00:00Z')],
      prices: { AAPL: 224.5 },
    });
    const { open, summary } = await service.getPositions('u1');
    expect(open![0].unrealizedPnl).toBe(0);
    expect(summary.unrealizedPnl).toBe(0);
  });

  it("n'invente pas une perte quand un actif n'a pas de cotation", async () => {
    const service = build({
      portfolio: PORTFOLIO,
      positions: [position('ZZZ', '5.000000', '10.0000')],
      executions: [execution('e1', 'ZZZ', 'buy', 5, 10, '2026-10-01T10:00:00Z')],
      prices: {},
    });
    const { open } = await service.getPositions('u1');
    expect(open![0]).toMatchObject({ priceAvailable: false, unrealizedPnl: 0, marketValue: 0 });
  });

  it('ignore les lignes de position soldées (quantité 0) du module de trading', async () => {
    const service = build({
      portfolio: PORTFOLIO,
      positions: [position('AAPL', '0.000000', '0.0000')],
      executions: [],
      prices,
    });
    const { open } = await service.getPositions('u1');
    expect(open).toEqual([]);
  });

  it("renvoie des listes vides et ne crée pas de portefeuille s'il n'existe pas", async () => {
    const service = build({ portfolio: null });
    const result = await service.getPositions('inconnu');
    expect(result.open).toEqual([]);
    expect(result.closed).toEqual([]);
    const allocation = await service.getAllocation('inconnu');
    expect(allocation.status).toBe('empty');
    expect(allocation.totalValue).toBe(0);
  });

  it('calcule la répartition avec alerte de concentration', async () => {
    const service = build({
      portfolio: { ...PORTFOLIO, cash: '40000.00' } as TradingPortfolio,
      positions: [position('BTC/USD', '1.000000', '60000.0000')],
      executions: [],
      prices: { 'BTC/USD': 60000 },
    });
    const allocation = await service.getAllocation('u1');
    expect(allocation.totalValue).toBe(100000);
    expect(allocation.status).toBe('warning');
    expect(allocation.concentratedSymbols).toEqual(['BTC/USD']);
    expect(allocation.slices[0]).toMatchObject({ key: 'CASH', weightPercent: 40 });
  });
});

describe('PositionsQueryDto', () => {
  const check = (status?: string) =>
    validate(plainToInstance(PositionsQueryDto, status === undefined ? {} : { status }));

  it('accepte open, closed, all ou rien', async () => {
    for (const status of ['open', 'closed', 'all', undefined]) {
      expect(await check(status)).toHaveLength(0);
    }
  });

  it('refuse un statut inconnu', async () => {
    expect(await check('pending')).toHaveLength(1);
  });
});

describe('PriceSource', () => {
  const source = (marks: Array<Partial<OrderBookMark>>) =>
    new PriceSource({ find: async () => marks } as never);

  it('retombe sur le prix de démonstration tant que le carnet est vide', async () => {
    const prices = await source([]).getPrices();
    expect(prices.get('AAPL')).toBe(224.5);
    expect(prices.get('XAU/USD')).toBe(2685.4);
    expect(prices.size).toBe(4);
  });

  it('utilise le dernier prix exécuté quand il existe, comme le module de trading', async () => {
    const prices = await source([
      { symbol: 'AAPL', lastPrice: '231.2500' },
    ]).getPrices();
    expect(prices.get('AAPL')).toBe(231.25);
    expect(prices.get('BTC/USD')).toBe(67500);
  });
});
