import { buildEquityCurve } from '../contract/equity.js';
import type { ParticipantData, PricePoint, ProtectionData, SessionData, SimEvent, TradeData } from '../contract/session-data.js';

/**
 * Séance « en cours » pour les tests de l'agent et du guide : les cotations
 * s'arrêtent à `minute` (comme dans une vraie salle), les événements futurs
 * existent mais ne doivent jamais être visibles.
 */
export interface LiveSessionOptions {
  minute: number;
  /** Prix à une minute donnée (par défaut : 2 700 puis -50 à la minute 22). */
  priceFor?: (minute: number) => number;
  events?: SimEvent[];
  participants?: Array<{ id: string; displayName?: string; trades?: TradeData[]; protections?: ProtectionData[] }>;
  symbols?: string[];
}

export const DEFAULT_EVENTS: SimEvent[] = [
  { id: 'ev-news', minute: 11, type: 'news', label: 'La Fed laisse entendre un durcissement' },
  { id: 'ev-shock', minute: 22, type: 'price_shock', label: 'Choc de prix : -3 %' },
];

const defaultPrice = (minute: number) => (minute < 11 ? 2700 : minute < 22 ? 2680 : 2619);

export function liveSession(options: LiveSessionOptions): SessionData {
  const { minute } = options;
  const symbols = options.symbols ?? ['XAU/USD'];
  const priceFor = options.priceFor ?? defaultPrice;
  const prices: PricePoint[] = symbols.flatMap((symbol) =>
    Array.from({ length: minute + 1 }, (_, m) => ({ minute: m, symbol, price: priceFor(m) })),
  );
  const initialCash = 100_000;
  const participants: ParticipantData[] = (options.participants ?? []).map((p) => {
    const trades = (p.trades ?? []).filter((t) => t.minute <= minute);
    return {
      id: p.id,
      displayName: p.displayName ?? p.id,
      trades,
      protections: (p.protections ?? []).filter((x) => x.minute <= minute),
      equity: buildEquityCurve(initialCash, trades, prices, minute),
    };
  });
  return {
    sessionId: 'salle-test',
    title: 'Le mardi de la panique',
    run: 1,
    initialCash,
    durationMinutes: 30,
    symbols,
    prices,
    events: (options.events ?? DEFAULT_EVENTS).filter((e) => e.minute <= minute),
    participants,
  };
}

export const buy = (id: string, minute: number, quantity: number, price: number, symbol = 'XAU/USD'): TradeData => ({
  id,
  minute,
  symbol,
  side: 'buy',
  quantity,
  price,
});

export const sell = (id: string, minute: number, quantity: number, price: number, symbol = 'XAU/USD'): TradeData => ({
  id,
  minute,
  symbol,
  side: 'sell',
  quantity,
  price,
});
