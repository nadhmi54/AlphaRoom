import type { FeedSpec } from './market-feed-config.js';
import type { RealTick } from './price-book.js';
import { WsFeed, type SocketFactory } from './ws-feed.js';

/** Flux public de transactions Binance : aucune clé nécessaire. */
export class BinanceFeed extends WsFeed {
  constructor(
    specs: readonly FeedSpec[],
    onTick: (tick: RealTick) => void,
    createSocket?: SocketFactory,
  ) {
    super('BinanceFeed', specs, onTick, createSocket);
  }

  protected url(): string {
    return 'wss://stream.binance.com:9443/stream';
  }

  /**
   * Abonnement après connexion (plutôt que dans l'URL) : un symbole inconnu
   * ne peut ainsi pas faire refuser la connexion des autres actifs.
   */
  protected onOpen(send: (message: unknown) => void): void {
    send({
      method: 'SUBSCRIBE',
      params: this.specs.map((spec) => `${spec.providerSymbol}@trade`),
      id: 1,
    });
  }

  protected parse(raw: string): RealTick[] {
    const message = JSON.parse(raw) as { data?: { s?: string; p?: string; T?: number } };
    const trade = message.data;
    if (!trade?.s || !trade.p) return [];
    const spec = this.specs.find((item) => item.providerSymbol === trade.s?.toLowerCase());
    const price = Number(trade.p);
    if (!spec || !(price > 0)) return [];
    // L'instant de réception sert de référence : il évite de dépendre de
    // l'horloge de Binance pour décider si le prix est « frais ».
    return [{ symbol: spec.symbol, price, at: Date.now() }];
  }
}
