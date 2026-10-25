import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { MarketDataService } from './market-data.service.js';
import { HistoryQueryDto } from './dto/history-query.dto.js';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

function build(queryImpl?: (sql: string, params?: unknown[]) => unknown) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return queryImpl ? queryImpl(sql, params) : [];
  });
  const dataSource = {
    query,
    transaction: async (fn: (manager: { query: typeof query }) => Promise<void>) => fn({ query }),
  } as unknown as DataSource;
  const config = { get: () => undefined } as unknown as ConfigService;
  const service = new MarketDataService(dataSource, config);
  service.feedFactory = () => [];
  return { service, calls, query };
}

const seeded = () => {
  let s = 11;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

describe('MarketDataService', () => {
  it('avant le démarrage, renvoie les prix de démonstration en simulation', () => {
    const { service } = build();
    const quotes = service.quotes();
    expect(quotes.map((q) => q.symbol)).toEqual(['XAU/USD', 'EUR/USD', 'BTC/USD', 'AAPL']);
    expect(quotes.every((q) => q.source === 'simulated' && q.price > 0)).toBe(true);
  });

  it('enregistre un tick par actif et recopie le prix dans le carnet toutes les 3 s', async () => {
    const { service, calls } = build();
    await service.start(seeded());
    service.stop();
    calls.length = 0;

    const t0 = Date.now();
    await service.runTick(t0 + 1000);
    await service.runTick(t0 + 2000);
    expect(calls.filter((c) => c.sql.includes('insert into public.market_ticks'))).toHaveLength(2);
    expect(calls.some((c) => c.sql.includes('order_book_marks'))).toBe(false);

    await service.runTick(t0 + 3000);
    const marks = calls.filter((c) => c.sql.includes('insert into public.order_book_marks'));
    expect(marks).toHaveLength(4);
    // Ne touche pas à la date du dernier échange réel.
    expect(marks[0].sql).not.toMatch(/set[\s\S]*last_trade_at\s*=/);
    // Même verrou que le carnet d'ordres.
    expect(calls.some((c) => c.sql.includes('pg_advisory_xact_lock') && c.params?.[0] === 'alpharoom.order_book')).toBe(true);
  });

  it('un prix réel reçu apparaît en direct dans les cotations', async () => {
    const { service } = build();
    await service.start(seeded());
    service.stop();
    const now = Date.now();
    service.ingest({ symbol: 'BTC/USD', price: 71000, at: now });
    await service.runTick(now + 500);
    const btc = service.quotes().find((q) => q.symbol === 'BTC/USD');
    expect(btc).toMatchObject({ price: 71000, source: 'live' });
    expect(btc?.spark.at(-1)).toBe(71000);
  });

  it('continue de tourner si la base est indisponible', async () => {
    const { service } = build(() => {
      throw new Error('base coupée');
    });
    await service.start(seeded());
    service.stop();
    await expect(service.runTick(Date.now() + 1000)).resolves.toBeUndefined();
    expect(service.quotes()[0].price).toBeGreaterThan(0);
  });

  it('limite la mini-courbe à ~60 points', async () => {
    const { service } = build();
    await service.start(seeded());
    service.stop();
    const t0 = Date.now();
    for (let i = 1; i <= 400; i += 1) await service.runTick(t0 + i * 1000);
    const spark = service.quotes()[0].spark;
    expect(spark.length).toBeGreaterThan(55);
    expect(spark.length).toBeLessThanOrEqual(61);
  });

  it('history : lit la base par tranches et calcule la variation', async () => {
    const rows = [
      { t: '2026-10-25T10:00:00Z', price: '100', source: 'live' },
      { t: '2026-10-25T10:00:10Z', price: '110', source: 'simulated' },
    ];
    const { service, calls } = build((sql) => (sql.includes('date_bin') ? rows : []));
    const result = await service.history('BTC/USD', '1h');
    expect(result.points).toHaveLength(2);
    expect(result.changePercent).toBeCloseTo(10);
    expect(calls.at(-1)?.params?.[2]).toBe('10 seconds');
  });

  it('history : replie sur la mémoire du moteur quand la base est vide', async () => {
    const { service } = build();
    await service.start(seeded());
    service.stop();
    const t0 = Date.now();
    for (let i = 1; i <= 5; i += 1) await service.runTick(t0 + i * 1000);
    const result = await service.history('AAPL', '5m');
    expect(result.points.length).toBe(5);
  });

  it('history : un actif inconnu renvoie une liste vide', async () => {
    const { service } = build();
    expect((await service.history('NOPE', '5m')).points).toEqual([]);
  });
});

describe('HistoryQueryDto', () => {
  const check = (plain: object) => validateSync(plainToInstance(HistoryQueryDto, plain));
  it('accepte un actif connu et une période valide', () => {
    expect(check({ symbol: 'AAPL', range: '1h' })).toHaveLength(0);
    expect(check({ symbol: 'AAPL' })).toHaveLength(0);
  });
  it('refuse un actif ou une période inconnus', () => {
    expect(check({ symbol: 'NOPE' })).not.toHaveLength(0);
    expect(check({ symbol: 'AAPL', range: '7d' })).not.toHaveLength(0);
  });
});
