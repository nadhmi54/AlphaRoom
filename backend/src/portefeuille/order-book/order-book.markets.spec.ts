import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import type { BinanceRestService } from '../market-data/binance-rest.service.js';
import type { TradingService } from '../trading/trading.service.js';
import { TradingPortfolio } from '../trading/portfolio.entity.js';
import { TradingPosition } from '../trading/position.entity.js';
import { OrderBookMark } from './order-book-mark.entity.js';
import { Order } from './order.entity.js';
import { OrderBookService } from './order-book.service.js';

/**
 * Faux dépôt TypeORM en mémoire : assez fidèle pour exercer le vrai moteur
 * d'appariement et la vraie logique de liquidité sans toucher la base.
 */
class FakeRepository {
  rows: Array<Record<string, unknown>> = [];
  private nextId = 1;

  constructor(private readonly prefix: string) {}

  create(data: Record<string, unknown> = {}) {
    const id = `${this.prefix}-${this.nextId++}`;
    return {
      id,
      seq: String(this.nextId),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    } as Record<string, unknown>;
  }

  async save(entity: Record<string, unknown>) {
    const row = entity.id ? entity : this.create(entity);
    const index = this.rows.findIndex((candidate) => candidate.id === row.id);
    if (index >= 0) this.rows[index] = row;
    else this.rows.push(row);
    return row;
  }

  async insert(entities: Array<Record<string, unknown>>) {
    for (const entity of entities) this.rows.push(this.create(entity));
  }

  async find(options: { where?: Record<string, unknown> } = {}) {
    return this.rows.filter((row) => matches(row, options.where));
  }

  async findOne(options: { where?: Record<string, unknown> } = {}) {
    return this.rows.find((row) => matches(row, options.where)) ?? null;
  }

  async findOneByOrFail(criteria: Record<string, unknown>) {
    const row = await this.findOne({ where: criteria });
    if (!row) throw new Error('Ligne introuvable dans le faux dépôt.');
    return row;
  }

  async update(criteria: Record<string, unknown>, patch: Record<string, unknown>) {
    for (const row of this.rows.filter((candidate) => matches(candidate, criteria))) {
      Object.assign(row, patch);
    }
  }

  async delete(criteria: Record<string, unknown>) {
    this.rows = this.rows.filter((row) => !matches(row, criteria));
  }
}

function operatorValue(value: unknown): { type: string; value?: any } | null {
  if (!value || typeof value !== 'object' || !('type' in value)) return null;
  return value as { type: string; value?: any };
}

function matches(row: Record<string, unknown>, where?: Record<string, unknown>) {
  if (!where) return true;
  return Object.entries(where).every(([key, expected]) => {
    const operator = operatorValue(expected);
    if (operator?.type === 'in') return operator.value.includes(row[key]);
    if (operator?.type === 'isNull') return row[key] === null || row[key] === undefined;
    return row[key] === expected;
  });
}

interface HarnessOptions {
  /** Prix Binance simulés, indexés par symbole brut (ex. ETHUSDT). */
  binancePrices?: Record<string, number>;
  cash?: string;
  /** Dernier prix exécuté simulé, indexé par symbole interne. */
  lastExecuted?: Record<string, string>;
}

function buildHarness({ binancePrices = {}, cash = '100000', lastExecuted = {} }: HarnessOptions = {}) {
  const orderRepo = new FakeRepository('order');
  const markRepo = new FakeRepository('mark');
  const positionRepo = new FakeRepository('position');
  const portfolioRepo = new FakeRepository('portfolio');

  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    // `recordMark` écrit le dernier prix exécuté : on l'applique réellement
    // pour que la lecture suivante du carnet utilise ce mark.
    if (sql.includes('insert into public.order_book_marks')) {
      const [symbol, price] = params as [string, string];
      const existing = markRepo.rows.find((row) => row.symbol === symbol);
      if (existing) {
        existing.lastPrice = price;
        existing.updatedAt = new Date();
      } else {
        markRepo.rows.push({
          symbol,
          lastPrice: price,
          lastTradeAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
    if (sql.includes('from public.trade_executions') && params) {
      const price = lastExecuted[params[0] as string];
      return price ? [{ price }] : [];
    }
    return [];
  });

  const getRepository = (entity: unknown) => {
    if (entity === Order) return orderRepo;
    if (entity === OrderBookMark) return markRepo;
    if (entity === TradingPosition) return positionRepo;
    if (entity === TradingPortfolio) return portfolioRepo;
    throw new Error('Entité inconnue dans le faux dépôt.');
  };

  const manager = { getRepository, query };
  const dataSource = {
    getRepository,
    query,
    transaction: async (fn: (entityManager: typeof manager) => Promise<unknown>) => fn(manager),
  } as unknown as DataSource;

  const trading = {
    lockPortfolio: vi.fn(async () => ({ id: 'portfolio-1', cash })),
    applyFill: vi.fn(async () => ({})),
  };

  const binance = {
    getPrice: vi.fn(async (symbol: string) => binancePrices[symbol] ?? null),
  };

  const service = new OrderBookService(
    dataSource,
    trading as unknown as TradingService,
    binance as unknown as BinanceRestService,
  );

  return { service, orderRepo, markRepo, positionRepo, trading, binance };
}

function seedPosition(
  positionRepo: FakeRepository,
  symbol: string,
  quantity = '10.000000',
  averagePrice = '1.0000',
) {
  positionRepo.rows.push({
    id: `position-${symbol}`,
    portfolioId: 'portfolio-1',
    symbol,
    quantity,
    averagePrice,
    stopLoss: null,
    takeProfit: null,
  });
}

/** Les actifs exigés : crypto (native et Binance), or, forex, actions et pétrole. */
const ASSETS = [
  // Les paires USDT sont désormais dans le catalogue commun : le carnet prend
  // le prix de référence du catalogue, pas un prix Binance séparé.
  { symbol: 'ETH/USDT', binanceSymbol: 'ETHUSDT', price: 2600, quantity: 1 },
  { symbol: 'BNB/USDT', binanceSymbol: 'BNBUSDT', price: 590, quantity: 1 },
  { symbol: 'BTC/USD', binanceSymbol: null, price: 67500, quantity: 0.1 },
  { symbol: 'SOL/USDT', binanceSymbol: 'SOLUSDT', price: 175, quantity: 5 },
  { symbol: 'XRP/USDT', binanceSymbol: 'XRPUSDT', price: 0.55, quantity: 100 },
  { symbol: 'XAU/USD', binanceSymbol: null, price: 2685.4, quantity: 0.5 },
  { symbol: 'EUR/USD', binanceSymbol: null, price: 1.0834, quantity: 100 },
  { symbol: 'AAPL', binanceSymbol: null, price: 224.5, quantity: 1 },
  { symbol: 'MSFT', binanceSymbol: null, price: 421.3, quantity: 10 },
  { symbol: 'WTI/USD', binanceSymbol: null, price: 72.4, quantity: 10 },
  { symbol: 'GBP/USD', binanceSymbol: null, price: 1.2712, quantity: 1000 },
] as const;

const binancePrices = Object.fromEntries(
  ASSETS.filter((asset) => asset.binanceSymbol).map((asset) => [asset.binanceSymbol, asset.price]),
);

describe('OrderBookService — carnet multi-marchés', () => {
  it.each(ASSETS)(
    'affiche bids, asks, spread et dernier prix > 0 pour $symbol',
    async ({ symbol, price }) => {
      const { service } = buildHarness({ binancePrices });

      const book = await service.getBook(symbol);

      expect(book.bids.length).toBeGreaterThan(0);
      expect(book.asks.length).toBeGreaterThan(0);
      expect(book.bestBid).toBeGreaterThan(0);
      expect(book.bestAsk).toBeGreaterThan(0);
      expect(book.spread).toBeGreaterThan(0);
      expect(book.lastPrice).toBeGreaterThan(0);
      expect(book.lastPrice).toBeCloseTo(price, 2);
    },
  );

  it.each(ASSETS)('exécute un achat puis une vente pour $symbol', async ({ symbol, quantity }) => {
    const { service, positionRepo } = buildHarness({ binancePrices });

    const buy = await service.placeOrder(`buyer-${symbol}`, {
      symbol,
      side: 'buy',
      type: 'market',
      quantity,
      requestId: randomUUID(),
    });
    expect(buy.filledQuantity).toBeGreaterThan(0);
    expect(buy.order.symbol).toBe(symbol);

    seedPosition(positionRepo, symbol, String(quantity));

    const sell = await service.placeOrder(`seller-${symbol}`, {
      symbol,
      side: 'sell',
      type: 'market',
      quantity,
      requestId: randomUUID(),
    });
    expect(sell.filledQuantity).toBeGreaterThan(0);
    expect(sell.order.symbol).toBe(symbol);
  });

  it('accepte les deux écritures d’un même symbole et isole les carnets', async () => {
    const { service } = buildHarness({ binancePrices });

    const eth = await service.getBook('ethusdt');
    const bnb = await service.getBook('BNBUSDT');

    expect(eth.symbol).toBe('ETH/USDT');
    expect(bnb.symbol).toBe('BNB/USDT');
    expect(eth.lastPrice).toBeCloseTo(2600, 2);
    expect(bnb.lastPrice).toBeCloseTo(590, 2);
    expect(eth.lastPrice).not.toBe(bnb.lastPrice);
  });

  it('découvre une paire absente du catalogue via Binance REST', async () => {
    const { service, binance } = buildHarness({ binancePrices: { DOGEUSDT: 0.25 } });

    const book = await service.getBook('dogeusdt');

    expect(book.symbol).toBe('DOGE/USDT');
    expect(book.lastPrice).toBeCloseTo(0.25, 4);
    expect(binance.getPrice).toHaveBeenCalledWith('DOGEUSDT');
  });
});

describe('OrderBookService — erreurs métier en français', () => {
  it('utilise le dernier prix exécuté en base quand Binance ne répond pas', async () => {
    const { service } = buildHarness({ lastExecuted: { 'ZZZ/USDT': '42.50' } });

    const book = await service.getBook('ZZZ/USDT');

    expect(book.lastPrice).toBeCloseTo(42.5, 2);
    expect(book.bids.length).toBeGreaterThan(0);
    expect(book.asks.length).toBeGreaterThan(0);
  });

  it('refuse un actif sans prix réel avec un message explicite', async () => {
    const { service } = buildHarness();

    await expect(service.getBook('ZZZ/USDT')).rejects.toThrow(
      /Aucune donnée de prix disponible pour ZZZ\/USDT/,
    );
    await expect(
      service.placeOrder('owner-1', {
        symbol: 'ZZZ/USDT',
        side: 'buy',
        type: 'market',
        quantity: 1,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow(/Aucune donnée de prix disponible/);
  });

  it('refuse un achat dont le montant dépasse le solde disponible', async () => {
    const { service } = buildHarness({ binancePrices, cash: '10' });

    await expect(
      service.placeOrder('owner-1', {
        symbol: 'ETH/USDT',
        side: 'buy',
        type: 'market',
        quantity: 1,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow(/Solde insuffisant/);
  });

  it('refuse une quantité nulle ou négative', async () => {
    const { service } = buildHarness({ binancePrices });

    await expect(
      service.placeOrder('owner-1', {
        symbol: 'ETH/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow(/quantité doit être strictement positive/i);

    await expect(
      service.placeOrder('owner-1', {
        symbol: 'ETH/USDT',
        side: 'sell',
        type: 'market',
        quantity: -1,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow(/quantité doit être strictement positive/i);
  });

  it('refuse une vente supérieure à la position détenue', async () => {
    const { service, positionRepo } = buildHarness({ binancePrices });
    seedPosition(positionRepo, 'ETH/USDT', '0.500000');

    await expect(
      service.placeOrder('owner-1', {
        symbol: 'ETH/USDT',
        side: 'sell',
        type: 'market',
        quantity: 1,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow(/Quantité insuffisante/);
  });

  it('annule les niveaux système obsolètes sans les supprimer (comptabilité)', async () => {
    const { service, orderRepo, markRepo } = buildHarness({ binancePrices });
    await service.getBook('ETH/USDT');

    const before = orderRepo.rows.filter((order) => order.ownerId === null);
    expect(before.length).toBe(8);
    const beforeIds = before.map((order) => order.id);

    // Un mark plus élevé déplace toute la grille : les anciens niveaux doivent
    // être annulés, jamais supprimés (ils peuvent référencer des exécutions).
    markRepo.rows.push({
      symbol: 'ETH/USDT',
      lastPrice: '3000',
      lastTradeAt: new Date(),
      updatedAt: new Date(),
    });
    await service.getBook('ETH/USDT');

    const previous = orderRepo.rows.filter((order) => beforeIds.includes(order.id as string));
    expect(previous).toHaveLength(8);
    expect(previous.every((order) => order.status === 'cancelled')).toBe(true);
    const open = orderRepo.rows.filter(
      (order) => order.ownerId === null && order.status === 'open',
    );
    expect(open).toHaveLength(8);
  });
});
