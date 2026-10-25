const SECONDS_PER_YEAR = 365 * 24 * 3600;

/**
 * Multiplicateur de volatilité : une vraie volatilité à la seconde est si
 * faible qu'une courbe de simulation paraîtrait figée. ×3 la rend lisible sans
 * lui faire quitter l'ordre de grandeur du marché.
 */
export const SIM_VOLATILITY_MULTIPLIER = 3;

/** Force de rappel vers le dernier prix réel (par seconde). */
export const SIM_REVERSION_PER_SECOND = 0.005;

/** Loi normale centrée réduite (Box-Muller) à partir d'un tirage uniforme. */
export function gaussian(random: () => number): number {
  const u = Math.max(random(), Number.EPSILON);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Un pas de mouvement brownien géométrique (le modèle classique des prix) :
 *   S(t+dt) = S(t) · exp(−σ²dt/2 + σ·√dt·Z)
 * auquel s'ajoute un léger rappel vers `anchor` (dernier prix réel connu), pour
 * qu'une longue simulation ne dérive pas loin de la réalité.
 */
export function simulateStep(
  price: number,
  anchor: number,
  annualVolatility: number,
  dtSeconds: number,
  random: () => number,
): number {
  const sigma = annualVolatility * SIM_VOLATILITY_MULTIPLIER;
  const dt = dtSeconds / SECONDS_PER_YEAR;
  const shock = gaussian(random);
  const growth = Math.exp(-0.5 * sigma * sigma * dt + sigma * Math.sqrt(dt) * shock);
  const reverted = price + (anchor - price) * SIM_REVERSION_PER_SECOND * dtSeconds;
  const next = reverted * growth;
  return next > 0 ? next : price;
}
