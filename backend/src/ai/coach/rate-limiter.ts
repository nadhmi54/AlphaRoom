export interface RateLimit {
  windowMs: number;
  max: number;
}

/**
 * Limite en mémoire (fenêtre glissante) : protège le budget du modèle contre
 * un étudiant qui enchaîne les questions. Une seule instance du serveur ; si
 * le backend est répliqué, il faudra un compteur partagé.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limits: RateLimit[],
    private readonly now: () => number = Date.now,
  ) {}

  /** Enregistre un appel. `ok: false` : trop d'appels, réessayer dans `retryAfterMs`. */
  hit(key: string): { ok: boolean; retryAfterMs: number } {
    const now = this.now();
    const longest = Math.max(...this.limits.map((l) => l.windowMs));
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < longest);
    for (const { windowMs, max } of this.limits) {
      const inWindow = recent.filter((t) => now - t < windowMs);
      if (inWindow.length >= max) {
        this.hits.set(key, recent);
        return { ok: false, retryAfterMs: Math.max(0, windowMs - (now - inWindow[0]!)) };
      }
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { ok: true, retryAfterMs: 0 };
  }
}
