import { describe, expect, it, vi } from 'vitest';
import { FEED_SPECS } from '../../portefeuille/market-data/market-feed-config.js';
import { MarketHistoryService, analysableSymbols, originsFor, parseBinanceKlines, parseYahooHistory } from './history.js';

const DAY = 86_400_000;
const T0 = Date.parse('2026-05-01T00:00:00Z');

const binanceRows = (n: number) => Array.from({ length: n }, (_, i) => [T0 + i * DAY, '100', '102', '99', String(100 + i), '10']);
const yahooPayload = (n: number, withHole = false) => ({
  chart: {
    result: [
      {
        timestamp: Array.from({ length: n }, (_, i) => Math.floor((T0 + i * DAY) / 1000)),
        indicators: {
          quote: [
            {
              open: Array.from({ length: n }, () => 50),
              high: Array.from({ length: n }, () => 52),
              low: Array.from({ length: n }, () => 49),
              close: Array.from({ length: n }, (_, i) => (withHole && i === 3 ? null : 50 + i)),
            },
          ],
        },
      },
    ],
  },
});
const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });

describe('historique réel des marchés', () => {
  it('lit les bougies Binance (ordre chronologique, valeurs invalides ignorées)', () => {
    const rows = [...binanceRows(3), ['x', 'a', 'b', 'c', 'd'], [T0, '0', '0', '0', '0']];
    const candles = parseBinanceKlines(rows);
    expect(candles).toHaveLength(3);
    expect(candles[0]).toMatchObject({ t: '2026-05-01', open: 100, high: 102, low: 99, close: 100 });
    expect(parseBinanceKlines({ code: -1121 })).toEqual([]);
  });

  it('lit les bougies Yahoo et saute les jours sans cotation', () => {
    const candles = parseYahooHistory(yahooPayload(6, true));
    expect(candles).toHaveLength(5);
    expect(candles.map((c) => c.close)).not.toContain(0);
    expect(parseYahooHistory({ chart: { result: null } })).toEqual([]);
  });

  it('choisit la source de chaque actif : or et euro chez Yahoo avec Binance en secours signalé comme substitut', () => {
    const gold = originsFor(FEED_SPECS.find((s) => s.symbol === 'XAU/USD')!);
    expect(gold[0]).toMatchObject({ provider: 'yahoo', providerSymbol: 'GC=F', proxy: false });
    expect(gold[1]).toMatchObject({ provider: 'binance', providerSymbol: 'PAXGUSDT', proxy: true });
    expect(originsFor(FEED_SPECS.find((s) => s.symbol === 'ETH/USDT')!)).toEqual([{ provider: 'binance', providerSymbol: 'ETHUSDT', proxy: false }]);
    expect(originsFor(FEED_SPECS.find((s) => s.symbol === 'AAPL')!)[0]).toMatchObject({ provider: 'yahoo', providerSymbol: 'AAPL' });
  });

  it('analyse tous les actifs du catalogue, sans doublon BTC', () => {
    const symbols = analysableSymbols();
    expect(symbols).toContain('BTC/USDT');
    expect(symbols).not.toContain('BTC/USD');
    expect(symbols.length).toBeGreaterThanOrEqual(20);
  });

  it('retombe sur le substitut Binance quand Yahoo échoue, et le dit', async () => {
    const service = new MarketHistoryService();
    service.fetchImpl = vi.fn(async (url: string) => (url.includes('yahoo') ? { ok: false, status: 429, json: async () => ({}) } : ok(binanceRows(60)))) as never;
    const history = await service.get('XAU/USD');
    expect(history).toMatchObject({ symbol: 'XAU/USD', source: 'binance', proxy: true, category: 'commodity' });
    expect(history!.candles).toHaveLength(60);
  });

  it('met en cache (un seul appel réseau) et renvoie null sans exception quand tout échoue', async () => {
    const service = new MarketHistoryService();
    const fetchImpl = vi.fn(async () => ok(yahooPayload(80)));
    service.fetchImpl = fetchImpl as never;
    await service.get('AAPL');
    await service.get('AAPL');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const down = new MarketHistoryService();
    down.fetchImpl = (async () => {
      throw new Error('réseau coupé');
    }) as never;
    expect(await down.get('MSFT')).toBeNull();
    expect(await down.get('actif-inconnu')).toBeNull();
  });

  it('ignore un historique trop court', async () => {
    const service = new MarketHistoryService();
    service.fetchImpl = (async () => ok(yahooPayload(10))) as never;
    expect(await service.get('MSFT')).toBeNull();
  });

  it('plusieurs actifs à la fois, par lots', async () => {
    const service = new MarketHistoryService();
    service.fetchImpl = (async () => ok(yahooPayload(80))) as never;
    const out = await service.getMany(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA']);
    expect(out.filter(Boolean)).toHaveLength(6);
  });
});
