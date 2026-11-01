import { priceAt, round } from '../contract/equity.js';
import {
  MARKET_IMPACT_EVENTS,
  type ParticipantData,
  type SessionData,
} from '../contract/session-data.js';
import { buildCycles, type PositionCycle } from './position-cycles.js';

/**
 * Métriques d'un participant sur un passage de séance.
 *
 * Tout est calculé ici, en code déterministe et testé : le modèle de langage
 * ne calcule JAMAIS un chiffre, il les explique. Chaque métrique porte les
 * preuves (exécutions, minutes, événements) sur lesquelles elle repose, pour
 * que toute affirmation d'un rapport puisse être vérifiée.
 *
 * Les rapports (« rendement = 0,05 ») sont des fractions : 0,05 vaut +5 %.
 */

export type Evidence =
  | { type: 'trade'; id: string }
  | { type: 'event'; id: string }
  | { type: 'minute'; value: number };

export interface Metric<T> {
  value: T;
  evidence: Evidence[];
}

export interface ReactionDelay {
  eventId: string;
  eventType: string;
  eventMinute: number;
  /** Minutes entre l'événement et la première exécution qui suit (null si aucune dans la fenêtre). */
  minutes: number | null;
  tradeId: string | null;
}

export interface ParticipantMetrics {
  participantId: string;
  run: number;
  /** Gain ou perte en dollars (valeur finale − capital initial). */
  pnl: Metric<number>;
  /** pnl / capital initial. */
  returnRate: Metric<number>;
  /** Plus forte part du capital investie en positions, entre 0 et 1. */
  maxExposure: Metric<number>;
  /** Plus forte baisse depuis un sommet, négative (−0,06 = −6 %). 0 s'il n'y en a pas eu. */
  maxDrawdown: Metric<number>;
  /** Positions fermées gagnantes / positions fermées (null si aucune fermée). */
  winRate: Metric<number | null>;
  /** Gain moyen des gagnantes / perte moyenne des perdantes (null si l'un des deux manque). */
  payoffRatio: Metric<number | null>;
  /** Positions ayant eu un stop-loss / positions ouvertes (null si aucune position). */
  stopLossRatio: Metric<number | null>;
  /** Coût total du slippage en dollars (null si les prix attendus ne sont pas fournis). */
  slippagePaid: Metric<number | null>;
  /** Réaction à chaque événement qui bouscule le marché. */
  reactionDelays: Metric<ReactionDelay[]>;
  /** Poids de la plus grosse position au moment de l'exposition maximale (null si aucune position). */
  concentration: Metric<number | null>;
  tradeCount: number;
  closedPositions: number;
  openPositions: number;
  /** Informations que l'IA doit signaler comme manquantes plutôt que d'inventer. */
  missingData: string[];
}

export interface MetricsOptions {
  /** Au-delà de ce délai, une exécution n'est plus considérée comme une réaction à l'événement. */
  reactionWindowMinutes?: number;
}

const DEFAULT_REACTION_WINDOW = 10;

export function computeMetrics(
  session: SessionData,
  participantId: string,
  options: MetricsOptions = {},
): ParticipantMetrics {
  const participant = session.participants.find((p) => p.id === participantId);
  if (!participant) throw new Error(`Participant introuvable dans la séance : ${participantId}`);

  const window = options.reactionWindowMinutes ?? DEFAULT_REACTION_WINDOW;
  const missingData: string[] = [];
  const equity = [...participant.equity].sort((a, b) => a.minute - b.minute);
  const { cycles, anomalies } = buildCycles(participant.trades);

  if (participant.trades.length === 0) missingData.push('no_trades');
  if (equity.length === 0) missingData.push('no_equity');
  if (anomalies.length > 0) missingData.push('anomalous_sells');

  const totals = equity.map((p) => ({ minute: p.minute, total: p.cash + p.positionsValue, p }));
  const last = totals.at(-1);
  const pnlValue = last ? round(last.total - session.initialCash, 2) : 0;

  const exposure = computeExposure(totals, cycles);
  const drawdown = computeDrawdown(totals);
  const closed = cycles.filter((c) => c.status === 'closed');
  const winners = closed.filter((c) => c.realizedPnl > 0);
  const losers = closed.filter((c) => c.realizedPnl < 0);

  const hasExpected = participant.trades.some((t) => t.expectedPrice !== undefined);
  if (participant.trades.length > 0 && !hasExpected) missingData.push('no_expected_price');

  return {
    participantId,
    run: session.run,
    pnl: { value: pnlValue, evidence: last ? [{ type: 'minute', value: last.minute }] : [] },
    returnRate: {
      value: session.initialCash > 0 ? round(pnlValue / session.initialCash, 6) : 0,
      evidence: last ? [{ type: 'minute', value: last.minute }] : [],
    },
    maxExposure: { value: exposure.value, evidence: exposureEvidence(exposure.minute, cycles) },
    maxDrawdown: drawdown,
    winRate: {
      value: closed.length > 0 ? round(winners.length / closed.length, 6) : null,
      evidence: closed.map((c) => ({ type: 'trade', id: c.openingTradeId }) as Evidence),
    },
    payoffRatio: {
      value:
        winners.length > 0 && losers.length > 0
          ? round(average(winners.map((c) => c.realizedPnl)) / Math.abs(average(losers.map((c) => c.realizedPnl))), 6)
          : null,
      evidence: [...winners, ...losers].map((c) => ({ type: 'trade', id: c.openingTradeId }) as Evidence),
    },
    stopLossRatio: computeStopLossRatio(participant, cycles),
    slippagePaid: computeSlippage(participant, hasExpected),
    reactionDelays: computeReactions(session, participant, window),
    concentration: computeConcentration(session, participant, cycles, exposure),
    tradeCount: participant.trades.length,
    closedPositions: closed.length,
    openPositions: cycles.length - closed.length,
    missingData,
  };
}

/* ------------------------------------------------------------------ */

interface TotalPoint {
  minute: number;
  total: number;
  p: { cash: number; positionsValue: number };
}

function computeExposure(totals: TotalPoint[], _cycles: PositionCycle[]) {
  let value = 0;
  let minute = totals[0]?.minute ?? 0;
  for (const point of totals) {
    const ratio = point.total > 0 ? point.p.positionsValue / point.total : 0;
    if (ratio > value + 1e-12) {
      value = ratio;
      minute = point.minute;
    }
  }
  return { value: round(value, 6), minute };
}

/** Preuves de l'exposition maximale : la minute, et les achats des positions alors ouvertes. */
function exposureEvidence(minute: number, cycles: PositionCycle[]): Evidence[] {
  const open = cycles.filter(
    (c) => c.openMinute <= minute && (c.closeMinute === null || c.closeMinute > minute),
  );
  return [
    { type: 'minute', value: minute },
    ...open.map((c) => ({ type: 'trade', id: c.openingTradeId }) as Evidence),
  ];
}

function computeDrawdown(totals: TotalPoint[]): Metric<number> {
  let peak = totals[0]?.total ?? 0;
  let peakMinute = totals[0]?.minute ?? 0;
  let worst = 0;
  let worstPeak = peakMinute;
  let worstTrough = peakMinute;
  for (const point of totals) {
    if (point.total > peak) {
      peak = point.total;
      peakMinute = point.minute;
    }
    const drop = peak > 0 ? (point.total - peak) / peak : 0;
    if (drop < worst - 1e-12) {
      worst = drop;
      worstPeak = peakMinute;
      worstTrough = point.minute;
    }
  }
  return {
    value: round(worst, 6),
    evidence:
      worst < 0
        ? [
            { type: 'minute', value: worstPeak },
            { type: 'minute', value: worstTrough },
          ]
        : [],
  };
}

function computeStopLossRatio(participant: ParticipantData, cycles: PositionCycle[]): Metric<number | null> {
  if (cycles.length === 0) return { value: null, evidence: [] };
  const protectedCount = cycles.filter((cycle) =>
    participant.protections.some(
      (p) =>
        p.symbol === cycle.symbol &&
        p.stopLoss !== null &&
        p.minute >= cycle.openMinute &&
        (cycle.closeMinute === null || p.minute <= cycle.closeMinute),
    ),
  ).length;
  return {
    value: round(protectedCount / cycles.length, 6),
    evidence: cycles.map((c) => ({ type: 'trade', id: c.openingTradeId }) as Evidence),
  };
}

function computeSlippage(participant: ParticipantData, hasExpected: boolean): Metric<number | null> {
  if (!hasExpected) return { value: null, evidence: [] };
  let total = 0;
  const evidence: Evidence[] = [];
  for (const trade of participant.trades) {
    if (trade.expectedPrice === undefined) continue;
    const cost =
      (trade.side === 'buy' ? trade.price - trade.expectedPrice : trade.expectedPrice - trade.price) *
      trade.quantity;
    total += cost;
    if (cost > 1e-9) evidence.push({ type: 'trade', id: trade.id });
  }
  return { value: round(total, 2), evidence };
}

function computeReactions(
  session: SessionData,
  participant: ParticipantData,
  window: number,
): Metric<ReactionDelay[]> {
  const trades = [...participant.trades].sort((a, b) => a.minute - b.minute);
  const events = session.events
    .filter((e) => MARKET_IMPACT_EVENTS.includes(e.type))
    .sort((a, b) => a.minute - b.minute);
  const value: ReactionDelay[] = [];
  const evidence: Evidence[] = [];
  for (const event of events) {
    const next = trades.find((t) => t.minute >= event.minute && t.minute - event.minute <= window);
    value.push({
      eventId: event.id,
      eventType: event.type,
      eventMinute: event.minute,
      minutes: next ? next.minute - event.minute : null,
      tradeId: next ? next.id : null,
    });
    evidence.push({ type: 'event', id: event.id });
    if (next) evidence.push({ type: 'trade', id: next.id });
  }
  return { value, evidence };
}

function computeConcentration(
  session: SessionData,
  participant: ParticipantData,
  cycles: PositionCycle[],
  exposure: { value: number; minute: number },
): Metric<number | null> {
  if (cycles.length === 0 || exposure.value === 0) return { value: null, evidence: [] };
  const held = new Map<string, number>();
  const lastTradePrice = new Map<string, number>();
  for (const trade of [...participant.trades].sort((a, b) => a.minute - b.minute)) {
    if (trade.minute > exposure.minute) break;
    held.set(trade.symbol, (held.get(trade.symbol) ?? 0) + (trade.side === 'buy' ? trade.quantity : -trade.quantity));
    lastTradePrice.set(trade.symbol, trade.price);
  }
  const values: number[] = [];
  for (const [symbol, quantity] of held) {
    if (quantity < 1e-9) continue;
    const price = priceAt(session.prices, symbol, exposure.minute, lastTradePrice.get(symbol)) ?? 0;
    values.push(quantity * price);
  }
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0) return { value: null, evidence: [] };
  return { value: round(Math.max(...values) / sum, 6), evidence: [{ type: 'minute', value: exposure.minute }] };
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
