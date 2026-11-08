import { round } from '../contract/equity.js';
import { dailyReturns, mean, stdDev } from './indicators.js';

/**
 * Simulation Monte Carlo (mouvement brownien géométrique) sur la volatilité RÉELLE d'un actif.
 * Calculé par le code, jamais par le modèle. Dérive nulle volontairement : on ne prétend pas
 * prédire une direction, on mesure l'étendue des issues possibles pour une volatilité donnée.
 * Le générateur est « graîné » (mêmes entrées → mêmes chiffres) pour que les réponses soient
 * reproductibles et testables.
 */

export const SIMULATIONS = 5000;
export const MAX_DAYS = 60;
export const VOL_WINDOW = 60;
const LOSS_THRESHOLDS = [2, 5, 10];
const GAIN_THRESHOLDS = [2, 5, 10];

/** Petit générateur pseudo-aléatoire reproductible (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Loi normale centrée réduite (Box-Muller). */
function gaussian(random: () => number): number {
  let u = 0;
  while (u === 0) u = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))]!;
const pct = (fraction: number) => round(fraction * 100, 2);

export interface SimulationInput {
  closes: number[];
  days: number;
  /** Distance du stop-loss sous le prix, en fraction (0,03 = 3 %). */
  stopFraction?: number;
  seedKey: string;
}

/** Volatilité journalière estimée sur les derniers jours (rendements logarithmiques). */
export function dailyVolatility(closes: number[]): number {
  const window = closes.slice(-(VOL_WINDOW + 1));
  const logs = dailyReturns(window).map((r) => Math.log(1 + r));
  return stdDev(logs);
}

export function simulateOutcomes(input: SimulationInput) {
  const sigma = dailyVolatility(input.closes);
  const days = Math.min(Math.max(Math.trunc(input.days), 1), MAX_DAYS);
  const random = seededRandom(hashSeed(`${input.seedKey}:${days}:${input.stopFraction ?? 0}`));
  // Dérive d'Itô : l'espérance du prix reste constante (aucune direction supposée).
  const drift = -0.5 * sigma * sigma;
  const finals: number[] = Array.from({ length: SIMULATIONS }, () => 0);
  let stopTouched = 0;
  const stopLevel = input.stopFraction !== undefined ? Math.log(1 - input.stopFraction) : null;
  for (let s = 0; s < SIMULATIONS; s += 1) {
    let x = 0;
    let touched = false;
    for (let d = 0; d < days; d += 1) {
      x += drift + sigma * gaussian(random);
      if (stopLevel !== null && x <= stopLevel) touched = true;
    }
    finals[s] = Math.exp(x) - 1;
    if (touched) stopTouched += 1;
  }
  const sorted = [...finals].sort((a, b) => a - b);
  const share = (test: (r: number) => boolean) => finals.filter(test).length / SIMULATIONS;
  const tail = sorted.slice(0, Math.max(1, Math.floor(SIMULATIONS * 0.05)));
  return {
    sigma,
    days,
    distribution: {
      p5: quantile(sorted, 0.05),
      p25: quantile(sorted, 0.25),
      median: quantile(sorted, 0.5),
      p75: quantile(sorted, 0.75),
      p95: quantile(sorted, 0.95),
      mean: mean(finals),
      expectedShortfall5: mean(tail),
    },
    probLoss: share((r) => r < 0),
    probLossBeyond: LOSS_THRESHOLDS.map((t) => ({ threshold: t, prob: share((r) => r <= -t / 100) })),
    probGainBeyond: GAIN_THRESHOLDS.map((t) => ({ threshold: t, prob: share((r) => r >= t / 100) })),
    probStopTouched: stopLevel === null ? null : stopTouched / SIMULATIONS,
  };
}

/** Mise en forme pour l'agent : toutes les probabilités et variations portent le suffixe `_pct`. */
export function describeSimulation(sim: ReturnType<typeof simulateOutcomes>, annualFactor: number) {
  return {
    jours_simules: sim.days,
    nombre_de_simulations: SIMULATIONS,
    volatilite_journaliere_pct: pct(sim.sigma),
    volatilite_annuelle_pct: pct(sim.sigma * Math.sqrt(annualFactor)),
    probabilite_de_perte_pct: pct(sim.probLoss),
    probabilites_de_perte_au_moins: sim.probLossBeyond.map((p) => ({ perte_pct: p.threshold, probabilite_pct: pct(p.prob) })),
    probabilites_de_gain_au_moins: sim.probGainBeyond.map((p) => ({ gain_pct: p.threshold, probabilite_pct: pct(p.prob) })),
    resultat_pessimiste_5_pct: pct(sim.distribution.p5),
    resultat_median_pct: pct(sim.distribution.median),
    resultat_optimiste_95_pct: pct(sim.distribution.p95),
    quartile_bas_pct: pct(sim.distribution.p25),
    quartile_haut_pct: pct(sim.distribution.p75),
    perte_moyenne_dans_les_5_pct_pires_cas_pct: pct(sim.distribution.expectedShortfall5),
    ...(sim.probStopTouched !== null ? { probabilite_de_toucher_le_stop_pct: pct(sim.probStopTouched) } : {}),
  };
}
