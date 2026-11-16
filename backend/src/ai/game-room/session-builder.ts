import type { RunSnapshot } from '../../game-room/run-snapshot.js';
import { PANIC_TUESDAY_SCENARIO } from '../../game-room/scenario/panic-tuesday.scenario.js';
import type {
  EquityPoint,
  ParticipantData,
  PricePoint,
  ProtectionData,
  SessionData,
  SimEvent,
  SimEventType,
  TradeData,
} from '../contract/session-data.js';

const round = (value: number, decimals = 4) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const EVENT_TYPES: Record<string, SimEventType> = {
  NEWS: 'news',
  PRICE_SHOCK: 'price_shock',
  VOLATILITY_SHOCK: 'volatility_shock',
  SPREAD_SHOCK: 'spread_shock',
  LIQUIDITY_SHOCK: 'liquidity_shock',
  WHALE: 'whale',
  PAUSE: 'pause',
  RESUME: 'resume',
};

/** Prix d'un actif à une minute entière, par interpolation de la série (secondes → prix). */
function priceAtMinute(series: Array<{ t: number; price: number }>, minute: number): number | null {
  if (series.length === 0) return null;
  const seconds = minute * 60;
  const first = series[0]!;
  if (seconds <= first.t) return first.price;
  for (let i = 1; i < series.length; i += 1) {
    const b = series[i]!;
    if (seconds <= b.t) {
      const a = series[i - 1]!;
      const span = b.t - a.t;
      return span <= 0 ? b.price : a.price + ((b.price - a.price) * (seconds - a.t)) / span;
    }
  }
  return series.at(-1)!.price;
}

/** News et chocs intégrés au scénario « Le mardi de la panique » (ils ne sont pas dans game_events). */
function scenarioEvents(snapshot: RunSnapshot, lastMinute: number): SimEvent[] {
  if (snapshot.sourceMode !== 'scenario' || snapshot.scenarioId !== PANIC_TUESDAY_SCENARIO.id) return [];
  return PANIC_TUESDAY_SCENARIO.keypoints
    .filter((k) => k.eventType && k.newsTitle && k.minute <= lastMinute)
    .map((k) => ({
      id: `scenario-${k.minute}`,
      minute: k.minute,
      type: EVENT_TYPES[k.eventType!] ?? 'news',
      label: k.newsTitle!,
    }));
}

/**
 * Convertit une photo de la Game Room en `SessionData`, le contrat lu par tout
 * le module IA. Fonction pure : aucun accès base, aucune écriture.
 *
 * Choix assumés :
 *   - l'équité (cash + valeur des positions) est recalculée à partir des
 *     exécutions et des prix, sans commission ni marge : l'écart de commission
 *     n'est pas visible dans les indicateurs pédagogiques ;
 *   - une protection (stop-loss / take-profit) est datée à l'exécution de
 *     l'ordre qui la portait.
 */
export function buildSessionData(snapshot: RunSnapshot): SessionData {
  const lastMinute = Math.max(0, Math.floor(snapshot.elapsedMinutes));
  const minutes = Array.from({ length: lastMinute + 1 }, (_, i) => i);

  const prices: PricePoint[] = [];
  const priceLookup = new Map<string, number>();
  for (const symbol of snapshot.symbols) {
    const series = snapshot.series[symbol] ?? [];
    for (const minute of minutes) {
      const price = priceAtMinute(series, minute);
      if (price === null) continue;
      const rounded = round(price, 4);
      prices.push({ minute, symbol, price: rounded });
      priceLookup.set(`${symbol}#${minute}`, rounded);
    }
  }

  const events: SimEvent[] = [
    ...scenarioEvents(snapshot, snapshot.elapsedMinutes),
    ...snapshot.events
      .filter((e) => EVENT_TYPES[e.type] && e.minute <= snapshot.elapsedMinutes + 0.001)
      .map((e) => ({ id: e.id, minute: round(e.minute, 2), type: EVENT_TYPES[e.type]!, label: e.title })),
  ].sort((a, b) => a.minute - b.minute);

  const participants: ParticipantData[] = snapshot.participants.map((p) => {
    const mine = snapshot.trades.filter((t) => t.userId === p.userId).sort((a, b) => a.minute - b.minute);
    const trades: TradeData[] = mine.map((t) => ({
      id: t.id,
      minute: round(t.minute, 2),
      symbol: t.symbol,
      side: t.side,
      quantity: t.quantity,
      price: t.price,
    }));

    const tradeMinuteByOrder = new Map(mine.filter((t) => t.orderId).map((t) => [t.orderId!, t.minute]));
    const protections: ProtectionData[] = snapshot.orders
      .filter((o) => o.userId === p.userId && (o.stopLoss !== null || o.takeProfit !== null) && tradeMinuteByOrder.has(o.id))
      .map((o) => ({
        minute: round(tradeMinuteByOrder.get(o.id)!, 2),
        symbol: o.symbol,
        stopLoss: o.stopLoss,
        takeProfit: o.takeProfit,
      }));

    const equity: EquityPoint[] = minutes.map((minute) => {
      let cash = snapshot.initialCapital;
      const held = new Map<string, number>();
      for (const t of mine) {
        if (t.minute > minute) break;
        const signed = t.side === 'buy' ? t.quantity : -t.quantity;
        cash -= signed * t.price;
        held.set(t.symbol, (held.get(t.symbol) ?? 0) + signed);
      }
      let positionsValue = 0;
      for (const [symbol, quantity] of held) {
        positionsValue += quantity * (priceLookup.get(`${symbol}#${minute}`) ?? 0);
      }
      return { minute, cash: round(cash, 2), positionsValue: round(positionsValue, 2) };
    });

    return { id: p.userId, displayName: p.nickname, trades, protections, equity };
  });

  return {
    sessionId: snapshot.roomId,
    title: snapshot.roomName,
    run: snapshot.run,
    initialCash: snapshot.initialCapital,
    durationMinutes: snapshot.durationMinutes,
    symbols: snapshot.symbols,
    prices,
    events,
    participants,
  };
}
