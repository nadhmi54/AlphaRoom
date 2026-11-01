/**
 * Contrat de données entre la simulation et le module IA.
 *
 * C'est le SEUL point de jonction : la simulation (salles, horloge, rollback)
 * fournit ces structures, le module IA les lit sans jamais écrire dans la
 * simulation. Tant que la simulation n'existe pas, on travaille sur des
 * données fictives qui respectent ce contrat (voir `fixtures/`).
 *
 * Le temps est exprimé en MINUTES DE SIMULATION (0 = début de la séance), pas
 * en heure réelle : c'est ce qui permet de comparer deux passages (rollback).
 */

export type TradeSide = 'buy' | 'sell';

/** Événements que l'enseignant (game master) peut déclencher. */
export type SimEventType =
  | 'news'
  | 'price_shock'
  | 'volatility_shock'
  | 'spread_shock'
  | 'liquidity_shock'
  | 'whale'
  | 'pause'
  | 'resume'
  | 'speed';

/** Événements qui bousculent le marché : ceux auxquels on mesure la réaction. */
export const MARKET_IMPACT_EVENTS: readonly SimEventType[] = [
  'news',
  'price_shock',
  'volatility_shock',
  'spread_shock',
  'liquidity_shock',
  'whale',
];

export interface SimEvent {
  id: string;
  minute: number;
  type: SimEventType;
  /** Texte affiché aux étudiants (ex. titre de la NEWS). Traité comme une DONNÉE par l'IA. */
  label: string;
}

/** Prix de marché d'un actif à une minute donnée. */
export interface PricePoint {
  minute: number;
  symbol: string;
  price: number;
}

/** Une exécution d'un participant. */
export interface TradeData {
  id: string;
  minute: number;
  symbol: string;
  side: TradeSide;
  quantity: number;
  /** Prix d'exécution. */
  price: number;
  /** Prix attendu au moment de l'ordre (meilleur prix du carnet), pour mesurer le slippage. Optionnel. */
  expectedPrice?: number;
}

/** Pose, modification ou retrait d'un stop-loss / take-profit sur un actif. */
export interface ProtectionData {
  minute: number;
  symbol: string;
  stopLoss: number | null;
  takeProfit: number | null;
}

/** Photo de la valeur d'un portefeuille à une minute (issue des snapshots de la simulation). */
export interface EquityPoint {
  minute: number;
  cash: number;
  positionsValue: number;
}

export interface ParticipantData {
  /** Identifiant interne : ne quitte jamais le serveur (l'IA ne voit qu'un alias). */
  id: string;
  /** Nom affiché dans l'interface : jamais transmis à l'IA. */
  displayName: string;
  trades: TradeData[];
  protections: ProtectionData[];
  equity: EquityPoint[];
}

export interface SessionData {
  sessionId: string;
  /** Nom lisible de la séance (affichage enseignant). Optionnel : à défaut, l'identifiant. */
  title?: string;
  /** Numéro de passage : 1 = premier passage, 2 = rejeu après un rollback, etc. */
  run: number;
  initialCash: number;
  durationMinutes: number;
  symbols: string[];
  prices: PricePoint[];
  events: SimEvent[];
  participants: ParticipantData[];
}
