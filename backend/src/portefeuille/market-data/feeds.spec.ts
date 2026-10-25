import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BinanceFeed } from './binance-feed.js';
import { FinnhubFeed } from './finnhub-feed.js';
import { FEED_SPECS } from './market-feed-config.js';
import type { RealTick } from './price-book.js';
import type { SocketLike } from './ws-feed.js';

class FakeSocket implements SocketLike {
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  sent: string[] = [];
  closed = false;
  constructor(readonly url: string) {}
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
}

function setup<T>(build: (onTick: (t: RealTick) => void, factory: (url: string) => SocketLike) => T) {
  const sockets: FakeSocket[] = [];
  const ticks: RealTick[] = [];
  const feed = build(
    (tick) => ticks.push(tick),
    (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
  );
  return { feed, sockets, ticks };
}

const binanceSpecs = FEED_SPECS.filter((s) => s.provider === 'binance');
const finnhubSpecs = FEED_SPECS.filter((s) => s.provider === 'finnhub');

describe('BinanceFeed', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('s\'abonne, une fois connecté, aux flux de trades de tous les actifs Binance', () => {
    const { feed, sockets } = setup((onTick, factory) => new BinanceFeed(binanceSpecs, onTick, factory));
    feed.start();
    expect(sockets[0].url).toBe('wss://stream.binance.com:9443/stream');
    sockets[0].onopen?.({});
    const request = JSON.parse(sockets[0].sent[0]);
    expect(request.method).toBe('SUBSCRIBE');
    expect(request.params).toEqual(binanceSpecs.map((spec) => `${spec.providerSymbol}@trade`));
    feed.stop();
  });

  it('convertit un trade Binance en prix de l\'actif interne', () => {
    const { feed, sockets, ticks } = setup((onTick, factory) => new BinanceFeed(binanceSpecs, onTick, factory));
    feed.start();
    sockets[0].onopen?.({});
    sockets[0].onmessage?.({
      data: JSON.stringify({ stream: 'btcusdt@trade', data: { e: 'trade', s: 'BTCUSDT', p: '68123.50', T: 1 } }),
    });
    sockets[0].onmessage?.({
      data: JSON.stringify({ stream: 'paxgusdt@trade', data: { e: 'trade', s: 'PAXGUSDT', p: '2701.10' } }),
    });
    expect(ticks.map((t) => [t.symbol, t.price])).toEqual([
      ['BTC/USD', 68123.5],
      ['XAU/USD', 2701.1],
    ]);
    feed.stop();
  });

  it('ignore les messages illisibles et les symboles inconnus', () => {
    const { feed, sockets, ticks } = setup((onTick, factory) => new BinanceFeed(binanceSpecs, onTick, factory));
    feed.start();
    sockets[0].onmessage?.({ data: 'pas du json' });
    sockets[0].onmessage?.({ data: JSON.stringify({ data: { s: 'DOGEUSDT', p: '1' } }) });
    sockets[0].onmessage?.({ data: JSON.stringify({ data: { s: 'BTCUSDT', p: '0' } }) });
    expect(ticks).toEqual([]);
    feed.stop();
  });

  it('se reconnecte avec un délai croissant, et plus du tout après stop()', () => {
    const { feed, sockets } = setup((onTick, factory) => new BinanceFeed(binanceSpecs, onTick, factory));
    feed.start();
    expect(sockets).toHaveLength(1);

    sockets[0].onclose?.({});
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    sockets[1].onclose?.({});
    vi.advanceTimersByTime(1_999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    feed.stop();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(3);
    expect(sockets[2].closed).toBe(true);
  });
});

describe('FinnhubFeed', () => {
  it('s\'abonne à AAPL à l\'ouverture et lit les trades', () => {
    const { feed, sockets, ticks } = setup(
      (onTick, factory) => new FinnhubFeed(finnhubSpecs, 'cle-de-test', onTick, factory),
    );
    feed.start();
    expect(sockets[0].url).toBe('wss://ws.finnhub.io?token=cle-de-test');
    sockets[0].onopen?.({});
    expect(sockets[0].sent.map((m) => JSON.parse(m))).toEqual([{ type: 'subscribe', symbol: 'AAPL' }]);

    sockets[0].onmessage?.({ data: JSON.stringify({ type: 'ping' }) });
    sockets[0].onmessage?.({
      data: JSON.stringify({ type: 'trade', data: [{ s: 'AAPL', p: 231.2, t: 1, v: 10 }, { s: 'TSLA', p: 5 }] }),
    });
    expect(ticks.map((t) => [t.symbol, t.price])).toEqual([['AAPL', 231.2]]);
    feed.stop();
  });
});
