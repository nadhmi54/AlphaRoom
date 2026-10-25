import type { FeedSpec } from './market-feed-config.js';
import type { RealTick } from './price-book.js';
import { WsFeed, type SocketFactory } from './ws-feed.js';

/**
 * Flux de transactions Finnhub (actions US). Demande une clé gratuite, lue dans
 * FINNHUB_API_KEY ; le jeton passe dans l'URL et n'est jamais journalisé.
 */
export class FinnhubFeed extends WsFeed {
  constructor(
    specs: readonly FeedSpec[],
    private readonly apiKey: string,
    onTick: (tick: RealTick) => void,
    createSocket?: SocketFactory,
  ) {
    super('FinnhubFeed', specs, onTick, createSocket);
  }

  protected url(): string {
    return `wss://ws.finnhub.io?token=${encodeURIComponent(this.apiKey)}`;
  }

  protected onOpen(send: (message: unknown) => void): void {
    for (const spec of this.specs) send({ type: 'subscribe', symbol: spec.providerSymbol });
  }

  protected parse(raw: string): RealTick[] {
    const message = JSON.parse(raw) as {
      type?: string;
      data?: Array<{ s?: string; p?: number }>;
    };
    if (message.type !== 'trade' || !Array.isArray(message.data)) return [];
    const ticks: RealTick[] = [];
    for (const trade of message.data) {
      const spec = this.specs.find((item) => item.providerSymbol === trade.s);
      if (spec && typeof trade.p === 'number' && trade.p > 0) {
        ticks.push({ symbol: spec.symbol, price: trade.p, at: Date.now() });
      }
    }
    return ticks;
  }
}
