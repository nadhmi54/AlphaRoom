import { priceAt, round } from '../contract/equity.js';

/** Un prix garde sa précision propre (EUR/USD ≈ 1,0853, XRP ≈ 0,52) ; 2 décimales fausseraient les calculs. */
export const roundPrice = (value: number) => round(value, value >= 100 ? 2 : value >= 10 ? 3 : 5);
import type { ProtectionData, SessionData } from '../contract/session-data.js';
import { computeMetrics, type ParticipantMetrics } from '../metrics/metrics.js';
import { buildCycles } from '../metrics/position-cycles.js';

/**
 * Photo « en direct » d'un participant : où en est-il MAINTENANT dans la séance ?
 * Tout est calculé ici, en code déterministe : l'agent et le guide s'appuient
 * dessus, le modèle de langage n'a jamais à calculer un chiffre.
 */

export interface OpenPosition {
  symbol: string;
  quantity: number;
  averageCost: number;
  price: number;
  value: number;
  unrealizedPnl: number;
  stopLoss: number | null;
  takeProfit: number | null;
  openMinute: number;
  /** Part de la valeur totale du portefeuille, en fraction. */
  weight: number;
}

export interface LiveState {
  minute: number;
  cash: number;
  positionsValue: number;
  total: number;
  pnl: number;
  /** pnl / capital initial, en fraction. */
  returnRate: number;
  /** positionsValue / total, en fraction. */
  exposure: number;
  /** Baisse actuelle depuis le sommet de la séance (négative ou nulle), en fraction. */
  drawdown: number;
  positions: OpenPosition[];
  tradeCount: number;
  lastTradeMinute: number | null;
  metrics: ParticipantMetrics;
}

/** Minute actuelle de la séance : la plus récente cotation connue. */
export function currentMinute(session: SessionData): number {
  return session.prices.reduce((max, point) => Math.max(max, point.minute), 0);
}

/** Protection en vigueur d'une position : la plus récente posée depuis son ouverture. */
function activeProtection(protections: ProtectionData[], symbol: string, openMinute: number) {
  const mine = protections
    .filter((p) => p.symbol === symbol && p.minute >= openMinute)
    .sort((a, b) => a.minute - b.minute);
  const last = mine.at(-1);
  return { stopLoss: last?.stopLoss ?? null, takeProfit: last?.takeProfit ?? null };
}

export function liveState(session: SessionData, participantId: string): LiveState {
  const participant = session.participants.find((p) => p.id === participantId);
  if (!participant) throw new Error('Participant absent de la séance.');
  const minute = currentMinute(session);

  const equity = [...participant.equity].filter((p) => p.minute <= minute).sort((a, b) => a.minute - b.minute);
  const last = equity.at(-1);
  const cash = last?.cash ?? session.initialCash;
  const positionsValue = last?.positionsValue ?? 0;
  const total = cash + positionsValue;

  let peak = session.initialCash;
  for (const point of equity) peak = Math.max(peak, point.cash + point.positionsValue);

  const { cycles } = buildCycles(participant.trades.filter((t) => t.minute <= minute));
  const positions: OpenPosition[] = cycles
    .filter((c) => c.status === 'open' && c.quantity > 1e-9)
    .map((c) => {
      const price = priceAt(session.prices, c.symbol, minute, c.averageCost) ?? c.averageCost;
      const value = c.quantity * price;
      return {
        symbol: c.symbol,
        quantity: round(c.quantity, 6),
        averageCost: roundPrice(c.averageCost),
        price: roundPrice(price),
        value: round(value, 2),
        unrealizedPnl: round((price - c.averageCost) * c.quantity, 2),
        ...activeProtection(participant.protections, c.symbol, c.openMinute),
        openMinute: c.openMinute,
        weight: total > 0 ? round(value / total, 6) : 0,
      };
    });

  const trades = [...participant.trades].filter((t) => t.minute <= minute).sort((a, b) => a.minute - b.minute);
  return {
    minute,
    cash: round(cash, 2),
    positionsValue: round(positionsValue, 2),
    total: round(total, 2),
    pnl: round(total - session.initialCash, 2),
    returnRate: session.initialCash > 0 ? round((total - session.initialCash) / session.initialCash, 6) : 0,
    exposure: total > 0 ? round(positionsValue / total, 6) : 0,
    drawdown: peak > 0 ? round(Math.min(0, (total - peak) / peak), 6) : 0,
    positions,
    tradeCount: trades.length,
    lastTradeMinute: trades.at(-1)?.minute ?? null,
    metrics: computeMetrics(session, participantId),
  };
}
