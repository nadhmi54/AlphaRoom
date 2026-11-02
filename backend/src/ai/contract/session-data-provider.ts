import type { SessionData } from './session-data.js';

/** La séance demandée n'existe pas (ou pas pour ce passage). */
export class SessionNotFoundError extends Error {
  constructor(sessionId: string, run: number) {
    super(`Séance introuvable : ${sessionId} (passage ${run})`);
    this.name = 'SessionNotFoundError';
  }
}

/** Aucune source de données de séance n'est branchée (la simulation n'est pas encore connectée). */
export class SessionSourceUnavailableError extends Error {
  constructor() {
    super('La simulation n’est pas encore branchée au module IA (AI_SESSION_SOURCE).');
    this.name = 'SessionSourceUnavailableError';
  }
}

/** Jeton d'injection Nest du fournisseur de données de séance. */
export const SESSION_DATA_PROVIDER = Symbol('SESSION_DATA_PROVIDER');

/** Résumé d'une séance, pour proposer un choix dans l'interface. */
export interface SessionSummary {
  sessionId: string;
  title: string;
  /** Passages disponibles, par ordre croissant (1 = premier passage, 2 = après rollback…). */
  runs: number[];
  durationMinutes: number;
  symbols: string[];
  /** Identifiants réels des participants : ne sortent jamais tels quels vers un étudiant ni vers l'IA. */
  participantIds: string[];
}

/**
 * Ce que le module de simulation doit implémenter pour alimenter l'IA.
 * Lecture seule : aucune méthode ne modifie la séance.
 */
export interface SessionDataProvider {
  /** Données d'une séance pour un passage donné (1 = premier passage). */
  getSession(sessionId: string, run: number): Promise<SessionData>;
  /** Séances connues (facultatif : sans cela, l'interface demande l'identifiant de la séance). */
  listSessions?(): Promise<SessionSummary[]>;
}

/** Fournisseur en mémoire pour les tests et la démonstration, sans base de données. */
export class InMemorySessionDataProvider implements SessionDataProvider {
  private readonly sessions = new Map<string, SessionData>();

  constructor(sessions: SessionData[] = []) {
    for (const session of sessions) this.add(session);
  }

  add(session: SessionData): void {
    this.sessions.set(`${session.sessionId}#${session.run}`, session);
  }

  getSession(sessionId: string, run: number): Promise<SessionData> {
    const found = this.sessions.get(`${sessionId}#${run}`);
    if (!found) return Promise.reject(new SessionNotFoundError(sessionId, run));
    return Promise.resolve(found);
  }

  listSessions(): Promise<SessionSummary[]> {
    const grouped = new Map<string, SessionData[]>();
    for (const session of this.sessions.values()) {
      grouped.set(session.sessionId, [...(grouped.get(session.sessionId) ?? []), session]);
    }
    const out: SessionSummary[] = [];
    for (const [sessionId, runs] of grouped) {
      const sorted = [...runs].sort((a, b) => a.run - b.run);
      const latest = sorted.at(-1)!;
      out.push({
        sessionId,
        title: latest.title ?? sessionId,
        runs: sorted.map((r) => r.run),
        durationMinutes: latest.durationMinutes,
        symbols: latest.symbols,
        participantIds: [...new Set(sorted.flatMap((r) => r.participants.map((p) => p.id)))],
      });
    }
    return Promise.resolve(out.sort((a, b) => a.sessionId.localeCompare(b.sessionId)));
  }
}

/** Fournisseur par défaut tant que la simulation n'est pas branchée : échoue avec un message clair. */
export class UnconfiguredSessionDataProvider implements SessionDataProvider {
  getSession(): Promise<SessionData> {
    return Promise.reject(new SessionSourceUnavailableError());
  }

  listSessions(): Promise<SessionSummary[]> {
    return Promise.reject(new SessionSourceUnavailableError());
  }
}
