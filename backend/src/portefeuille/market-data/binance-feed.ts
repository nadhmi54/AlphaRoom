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
    // Plusieurs symboles internes peuvent partager une même paire Binance
    // (BTC/USD et BTC/USDT) : on déduplique l'abonnement pour ne pas recevoir
    // deux fois le même trade.
    const params = [...new Set(this.specs.map((spec) => `${spec.providerSymbol}@trade`))];
    send({ method: 'SUBSCRIBE', params, id: 1 });
  }

  protected parse(raw: string): RealTick[] {
    const message = JSON.parse(raw) as { data?: { s?: string; p?: string; T?: number } };
    const trade = message.data;
    if (!trade?.s || !trade.p) return [];
    const price = Number(trade.p);
    if (!(price > 0)) return [];
    const providerSymbol = trade.s.toLowerCase();
    // Un même flux peut alimenter plusieurs alias internes (BTC/USD, BTC/USDT).
    return this.specs
      .filter((spec) => spec.providerSymbol === providerSymbol)
      // L'instant de réception sert de référence : il évite de dépendre de
      // l'horloge de Binance pour décider si le prix est « frais ».
      .map((spec) => ({ symbol: spec.symbol, price, at: Date.now() }));
  }
}
