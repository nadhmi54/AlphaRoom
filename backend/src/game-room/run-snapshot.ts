/**
 * Photo d'un passage de séance, lisible sans base de données.
 *
 * Elle sert à deux choses :
 *   - alimenter le module IA avec l'état courant d'une salle ;
 *   - conserver le passage d'avant un rollback, car le rollback supprime les
 *     exécutions et les ordres postérieurs à la minute cible.
 */

export interface RunSnapshotTrade {
  id: string;
  userId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  /** Minute de simulation de l'exécution. */
  minute: number;
  orderId: string | null;
}

export interface RunSnapshotOrder {
  id: string;
  userId: string;
  symbol: string;
  stopLoss: number | null;
  takeProfit: number | null;
}

export interface RunSnapshotEvent {
  id: string;
  /** Type brut de la Game Room (NEWS, PRICE_SHOCK, ROLLBACK…). */
  type: string;
  title: string;
  minute: number;
}

export interface RunSnapshotParticipant {
  userId: string;
  nickname: string;
}

export interface RunSnapshot {
  roomId: string;
  roomName: string;
  /** Numéro du passage (1 = premier passage). */
  run: number;
  /** Minutes de simulation écoulées au moment de la photo. */
  elapsedMinutes: number;
  durationMinutes: number;
  initialCapital: number;
  symbols: string[];
  /** Origine des prix : « scenario » ajoute les news du scénario aux événements. */
  sourceMode: string;
  scenarioId: string;
  participants: RunSnapshotParticipant[];
  trades: RunSnapshotTrade[];
  orders: RunSnapshotOrder[];
  events: RunSnapshotEvent[];
  /** Prix par actif : secondes de simulation → prix. */
  series: Record<string, Array<{ t: number; price: number }>>;
}

interface RollbackLike {
  type: string;
  minute: number;
  createdAt: Date;
  payloadTargetMinute: number;
}

export interface TimedEvent extends RunSnapshotEvent {
  createdAt: Date;
  payloadTargetMinute?: number;
}

/**
 * Après un rollback, les événements postérieurs à la minute cible survivent en
 * base alors qu'ils appartiennent à l'ancien passage : on les écarte, et on
 * écarte aussi les marqueurs de rollback eux-mêmes.
 */
export function eventsOfCurrentRun(events: TimedEvent[]): RunSnapshotEvent[] {
  const rollbacks: RollbackLike[] = events
    .filter((e) => e.type === 'ROLLBACK')
    .map((e) => ({ type: e.type, minute: e.minute, createdAt: e.createdAt, payloadTargetMinute: e.payloadTargetMinute ?? 0 }));
  return events
    .filter((event) => event.type !== 'ROLLBACK')
    .filter((event) =>
      rollbacks.every((rb) => event.createdAt.getTime() >= rb.createdAt.getTime() || event.minute <= rb.payloadTargetMinute),
    )
    .map(({ createdAt: _createdAt, payloadTargetMinute: _target, ...rest }) => rest);
}
