import type { GuideAlert } from './guide-rules.js';

/**
 * Mémoire de séance de l'agent : ce qu'il a déjà dit à un étudiant, pour ne pas
 * se répéter et pour pouvoir dire « tu as encore oublié ton stop-loss, comme
 * tout à l'heure ».
 *
 * Elle vit dans la mémoire du serveur (pas en base) : elle suffit le temps d'une
 * séance, et un redémarrage du serveur ne fait que recommencer à zéro. Elle ne
 * contient que des codes d'alertes et les questions posées, jamais de nom.
 */

export interface MemoryEntry {
  /** Alertes déjà montrées (identifiants). */
  delivered: Set<string>;
  /** Historique des alertes montrées, de la plus ancienne à la plus récente. */
  alerts: Array<{ id: string; code: string; minute: number; title: string }>;
  /** Questions posées au coach (texte court). */
  questions: Array<{ minute: number; text: string }>;
  /** Le briefing de début a-t-il été donné ? */
  briefed: boolean;
  touchedAt: number;
}

const MAX_ALERTS = 60;
const MAX_QUESTIONS = 20;
const MAX_ENTRIES = 500;
const TTL_MS = 6 * 3_600_000;

export class AgentMemory {
  private readonly entries = new Map<string, MemoryEntry>();

  constructor(private readonly now: () => number = Date.now) {}

  static key(sessionId: string, run: number, userId: string) {
    return `${sessionId}:${run}:${userId}`;
  }

  get(key: string): MemoryEntry {
    this.prune();
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { delivered: new Set(), alerts: [], questions: [], briefed: false, touchedAt: this.now() };
      this.entries.set(key, entry);
    }
    entry.touchedAt = this.now();
    return entry;
  }

  /** Garde seulement les alertes jamais montrées, et les marque comme montrées. */
  takeFresh(key: string, alerts: GuideAlert[]): GuideAlert[] {
    const entry = this.get(key);
    const fresh = alerts.filter((a) => !entry.delivered.has(a.id));
    for (const alert of fresh) {
      entry.delivered.add(alert.id);
      entry.alerts.push({ id: alert.id, code: alert.code, minute: alert.minute, title: alert.title });
    }
    if (entry.alerts.length > MAX_ALERTS) entry.alerts.splice(0, entry.alerts.length - MAX_ALERTS);
    return fresh;
  }

  rememberQuestion(key: string, minute: number, text: string) {
    const entry = this.get(key);
    entry.questions.push({ minute, text: text.trim().slice(0, 200) });
    if (entry.questions.length > MAX_QUESTIONS) entry.questions.shift();
  }

  /** Résumé transmis au modèle (jamais d'identifiant d'utilisateur). */
  summary(key: string) {
    const entry = this.get(key);
    const counts = new Map<string, number>();
    for (const alert of entry.alerts) counts.set(alert.code, (counts.get(alert.code) ?? 0) + 1);
    return {
      alertes_deja_montrees: entry.alerts.slice(-12).map((a) => ({ minute: a.minute, code: a.code, titre: a.title })),
      repetitions_par_code: Object.fromEntries(counts),
      questions_deja_posees: entry.questions.slice(-8),
    };
  }

  private prune() {
    if (this.entries.size < MAX_ENTRIES) return;
    const limit = this.now() - TTL_MS;
    for (const [key, entry] of this.entries) if (entry.touchedAt < limit) this.entries.delete(key);
    while (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
