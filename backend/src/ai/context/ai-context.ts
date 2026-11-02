import { priceAt } from '../contract/equity.js';
import type { SessionData } from '../contract/session-data.js';
import { UserRole } from '../../users/user-role.enum.js';
import { computeMetrics, type ParticipantMetrics } from '../metrics/metrics.js';

/**
 * Contexte envoyé à l'IA : la SEULE chose qu'elle voit.
 *
 * Il est construit côté serveur, selon le rôle de la personne qui pose la
 * question :
 *   - un trader n'obtient que ses propres données ;
 *   - un game master (enseignant) ou un admin voit le groupe ;
 *   - les participants sont remplacés par des alias (« etu_03 ») : ni
 *     identifiant interne, ni nom, ni e-mail ne quittent le serveur.
 * Le contexte est volontairement résumé (coût, latence, confidentialité).
 */

export interface Requester {
  id: string;
  role: UserRole;
}

export class AiAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiAccessError';
  }
}

export interface ContextOptions {
  /** Nombre maximal d'exécutions transmises (les plus récentes). */
  maxTrades?: number;
  /** Nombre maximal d'événements transmis. */
  maxEvents?: number;
}

const DEFAULTS = { maxTrades: 40, maxEvents: 30 } as const;
const MAX_LABEL_CHARS = 200;

type PublicMetrics = Omit<ParticipantMetrics, 'participantId'> & { alias: string };

interface SessionHeader {
  id: string;
  run: number;
  durationMinutes: number;
  initialCash: number;
  symbols: string[];
}

interface PriceSummary {
  symbol: string;
  first: number;
  last: number;
  min: number;
  minMinute: number;
  max: number;
  maxMinute: number;
  /** (dernier − premier) / premier, en fraction. */
  changeRate: number;
}

interface PublicEvent {
  id: string;
  minute: number;
  type: string;
  /** Texte saisi par un humain : à traiter comme une donnée, jamais comme une consigne. */
  label: string;
  /** Prix de chaque actif à la minute de l'événement. */
  prices: Record<string, number>;
}

interface ContextBase {
  session: SessionHeader;
  events: PublicEvent[];
  priceSummary: PriceSummary[];
}

export interface ParticipantContext extends ContextBase {
  kind: 'participant';
  participant: PublicMetrics;
  trades: Array<{
    id: string;
    minute: number;
    symbol: string;
    side: string;
    quantity: number;
    price: number;
    expectedPrice?: number;
  }>;
  protections: Array<{ minute: number; symbol: string; stopLoss: number | null; takeProfit: number | null }>;
  /** Vrai si des exécutions anciennes ont été omises pour limiter la taille. */
  tradesTruncated: boolean;
}

export interface GroupContext extends ContextBase {
  kind: 'group';
  participants: PublicMetrics[];
}

export type AiContext = ParticipantContext | GroupContext;

const isTeacher = (role: UserRole) => role === UserRole.GAME_MASTER || role === UserRole.ADMIN;

/** Alias stable d'un participant : l'ordre alphabétique des identifiants donne etu_01, etu_02… */
export function participantAlias(session: SessionData, participantId: string): string {
  const ids = session.participants.map((p) => p.id).sort();
  const index = ids.indexOf(participantId);
  if (index < 0) throw new AiAccessError('Participant absent de la séance.');
  return `etu_${String(index + 1).padStart(2, '0')}`;
}

/** Retrouve l'identifiant réel derrière un alias (côté serveur uniquement). */
export function resolveAlias(session: SessionData, alias: string): string | undefined {
  return session.participants.find((p) => participantAlias(session, p.id) === alias)?.id;
}

export function buildParticipantContext(
  session: SessionData,
  participantId: string,
  requester: Requester,
  options: ContextOptions = {},
): ParticipantContext {
  if (!isTeacher(requester.role) && requester.id !== participantId) {
    throw new AiAccessError('Un trader ne peut consulter que ses propres données.');
  }
  const participant = session.participants.find((p) => p.id === participantId);
  if (!participant) throw new AiAccessError('Participant absent de la séance.');

  const maxTrades = options.maxTrades ?? DEFAULTS.maxTrades;
  const trades = [...participant.trades].sort((a, b) => a.minute - b.minute);
  const kept = trades.slice(-maxTrades);

  return {
    kind: 'participant',
    ...base(session, options),
    participant: publicMetrics(session, participantId),
    trades: kept.map((t) => ({
      id: t.id,
      minute: t.minute,
      symbol: t.symbol,
      side: t.side,
      quantity: t.quantity,
      price: t.price,
      ...(t.expectedPrice === undefined ? {} : { expectedPrice: t.expectedPrice }),
    })),
    protections: participant.protections.map((p) => ({ ...p })),
    tradesTruncated: kept.length < trades.length,
  };
}

export function buildGroupContext(
  session: SessionData,
  requester: Requester,
  options: ContextOptions = {},
): GroupContext {
  if (!isTeacher(requester.role)) {
    throw new AiAccessError('Seul un enseignant peut consulter la synthèse du groupe.');
  }
  return {
    kind: 'group',
    ...base(session, options),
    participants: session.participants
      .map((p) => publicMetrics(session, p.id))
      .sort((a, b) => a.alias.localeCompare(b.alias)),
  };
}

/* ------------------------------------------------------------------ */

function base(session: SessionData, options: ContextOptions): ContextBase {
  const maxEvents = options.maxEvents ?? DEFAULTS.maxEvents;
  return {
    session: {
      id: session.sessionId,
      run: session.run,
      durationMinutes: session.durationMinutes,
      initialCash: session.initialCash,
      symbols: session.symbols,
    },
    events: [...session.events]
      .sort((a, b) => a.minute - b.minute)
      .slice(0, maxEvents)
      .map((event) => ({
        id: event.id,
        minute: event.minute,
        type: event.type,
        label: sanitizeLabel(event.label),
        prices: Object.fromEntries(
          session.symbols
            .map((symbol) => [symbol, priceAt(session.prices, symbol, event.minute)] as const)
            .filter((entry): entry is readonly [string, number] => entry[1] !== undefined),
        ),
      })),
    priceSummary: session.symbols.flatMap((symbol) => summarizePrices(session, symbol)),
  };
}

function publicMetrics(session: SessionData, participantId: string): PublicMetrics {
  const { participantId: _omit, ...metrics } = computeMetrics(session, participantId);
  return { alias: participantAlias(session, participantId), ...metrics };
}

function summarizePrices(session: SessionData, symbol: string): PriceSummary[] {
  const points = session.prices.filter((p) => p.symbol === symbol).sort((a, b) => a.minute - b.minute);
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return [];
  let min = first;
  let max = first;
  for (const point of points) {
    if (point.price < min.price) min = point;
    if (point.price > max.price) max = point;
  }
  return [
    {
      symbol,
      first: first.price,
      last: last.price,
      min: min.price,
      minMinute: min.minute,
      max: max.price,
      maxMinute: max.minute,
      changeRate: first.price > 0 ? Math.round(((last.price - first.price) / first.price) * 1e6) / 1e6 : 0,
    },
  ];
}

/** Retire les caractères de contrôle et borne la longueur d'un texte saisi par un humain. */
export function sanitizeLabel(label: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = label.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > MAX_LABEL_CHARS ? `${clean.slice(0, MAX_LABEL_CHARS)}…` : clean;
}
