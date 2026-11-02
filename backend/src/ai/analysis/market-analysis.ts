import { priceAt, round } from '../contract/equity.js';
import { MARKET_IMPACT_EVENTS, type SessionData } from '../contract/session-data.js';
import { sanitizeLabel } from '../context/ai-context.js';
import type { Evidence } from '../metrics/metrics.js';
import { price, signedPct } from './format.js';

/**
 * Market Analyst : lecture du marché d'une séance, pour l'enseignant.
 * Tout est calculé par le code (prix, variations, volatilité, réactions) ;
 * le texte « highlights » est construit à partir de ces chiffres.
 */

/** Minutes après un événement sur lesquelles on mesure l'effet sur le prix. */
export const IMPACT_WINDOW = 5;
/** Minutes après un événement pendant lesquelles une exécution compte comme une réaction. */
export const REACTION_WINDOW = 10;

export interface SymbolAnalysis {
  symbol: string;
  first: number;
  last: number;
  changeRate: number;
  min: number;
  minMinute: number;
  max: number;
  maxMinute: number;
  /** Écart-type des variations d'une minute à l'autre, en fraction. */
  volatility: number;
  /** Plus forte variation d'une minute à la suivante. */
  biggestMove: { minute: number; rate: number } | null;
}

export interface EventAnalysis {
  id: string;
  type: string;
  minute: number;
  label: string;
  /** Effet sur chaque actif : prix juste avant, prix `IMPACT_WINDOW` minutes après. */
  impacts: Array<{ symbol: string; before: number; after: number; moveRate: number }>;
  participants: number;
  /** Participants ayant passé au moins un ordre dans la fenêtre de réaction. */
  reacted: number;
}

export interface Highlight {
  text: string;
  evidence: Evidence[];
}

export interface MarketAnalysis {
  sessionId: string;
  run: number;
  durationMinutes: number;
  symbols: SymbolAnalysis[];
  events: EventAnalysis[];
  highlights: Highlight[];
}

export function analyzeMarket(session: SessionData): MarketAnalysis {
  const symbols = session.symbols.flatMap((symbol) => analyzeSymbol(session, symbol));
  const events = [...session.events]
    .filter((e) => MARKET_IMPACT_EVENTS.includes(e.type))
    .sort((a, b) => a.minute - b.minute)
    .map((event) => analyzeEvent(session, event));
  return {
    sessionId: session.sessionId,
    run: session.run,
    durationMinutes: session.durationMinutes,
    symbols,
    events,
    highlights: buildHighlights(symbols, events),
  };
}

function analyzeSymbol(session: SessionData, symbol: string): SymbolAnalysis[] {
  const points = session.prices.filter((p) => p.symbol === symbol).sort((a, b) => a.minute - b.minute);
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return [];
  let min = first;
  let max = first;
  let biggest: SymbolAnalysis['biggestMove'] = null;
  const returns: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]!;
    if (point.price < min.price) min = point;
    if (point.price > max.price) max = point;
    if (i === 0) continue;
    const previous = points[i - 1]!;
    if (previous.price <= 0) continue;
    const rate = (point.price - previous.price) / previous.price;
    returns.push(rate);
    if (!biggest || Math.abs(rate) > Math.abs(biggest.rate)) biggest = { minute: point.minute, rate: round(rate, 6) };
  }
  const mean = returns.reduce((s, r) => s + r, 0) / (returns.length || 1);
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length || 1);
  return [
    {
      symbol,
      first: first.price,
      last: last.price,
      changeRate: first.price > 0 ? round((last.price - first.price) / first.price, 6) : 0,
      min: min.price,
      minMinute: min.minute,
      max: max.price,
      maxMinute: max.minute,
      volatility: round(Math.sqrt(variance), 6),
      biggestMove: biggest && biggest.rate !== 0 ? biggest : null,
    },
  ];
}

function analyzeEvent(session: SessionData, event: SessionData['events'][number]): EventAnalysis {
  const reacted = session.participants.filter((p) =>
    p.trades.some((t) => t.minute >= event.minute && t.minute <= event.minute + REACTION_WINDOW),
  ).length;
  return {
    id: event.id,
    type: event.type,
    minute: event.minute,
    label: sanitizeLabel(event.label),
    impacts: session.symbols.flatMap((symbol) => {
      const before = priceAt(session.prices, symbol, Math.max(0, event.minute - 1));
      const after = priceAt(session.prices, symbol, Math.min(session.durationMinutes, event.minute + IMPACT_WINDOW));
      if (before === undefined || after === undefined || before <= 0) return [];
      return [{ symbol, before, after, moveRate: round((after - before) / before, 6) }];
    }),
    participants: session.participants.length,
    reacted,
  };
}

function buildHighlights(symbols: SymbolAnalysis[], events: EventAnalysis[]): Highlight[] {
  const out: Highlight[] = [];
  for (const s of symbols) {
    out.push({
      text:
        `${s.symbol} : de ${price(s.first)} à ${price(s.last)} (${signedPct(s.changeRate)}). ` +
        `Plus haut ${price(s.max)} à la minute ${s.maxMinute}, plus bas ${price(s.min)} à la minute ${s.minMinute}.`,
      evidence: [{ type: 'minute', value: s.minMinute }, { type: 'minute', value: s.maxMinute }],
    });
    if (s.biggestMove) {
      out.push({
        text: `${s.symbol} : la plus forte variation en une minute est ${signedPct(s.biggestMove.rate)}, à la minute ${s.biggestMove.minute}.`,
        evidence: [{ type: 'minute', value: s.biggestMove.minute }],
      });
    }
  }
  for (const e of events) {
    const effects = e.impacts
      .map((i) => `${i.symbol} ${price(i.before)} → ${price(i.after)} (${signedPct(i.moveRate)})`)
      .join(' ; ');
    out.push({
      text:
        `Minute ${e.minute}, ${e.type} « ${e.label} » : ${effects || 'effet sur le prix indisponible'}. ` +
        `${e.reacted} participant${e.reacted > 1 ? 's' : ''} sur ${e.participants} ${e.reacted > 1 ? 'ont' : 'a'} passé un ordre dans les ${REACTION_WINDOW} minutes.`,
      evidence: [{ type: 'event', id: e.id }],
    });
  }
  return out;
}
