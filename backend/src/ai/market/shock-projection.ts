import { priceAt, round } from '../contract/equity.js';
import type { SessionData, SimEvent } from '../contract/session-data.js';
import { currentMinute, liveState, roundPrice } from '../agent/live-state.js';
import { gaussian, hashSeed, seededRandom } from './montecarlo.js';

/**
 * Projection « après choc » : que peut faire la courbe dans les minutes qui suivent ?
 *
 * Ce n'est PAS une prévision. Le code mesure la volatilité de la série de la salle
 * (avant puis après le choc), simule des milliers de trajectoires sans direction
 * imposée, et en tire une fourchette (éventail) et la probabilité que le prix
 * repasse par son niveau d'avant le choc. Trois scénarios nommés (retour, rebond
 * partiel, continuation) montrent des trajectoires centrales plausibles ; ils sont
 * des hypothèses, jamais présentés comme une probabilité.
 *
 * Tout est calculé par le code, de façon reproductible (graine), avec les seules
 * données jusqu'à la minute actuelle : aucun prix du futur n'est utilisé.
 */

export const SHOCK_EVENT_TYPES = ['price_shock', 'volatility_shock', 'whale', 'spread_shock', 'liquidity_shock'] as const;
export const MAX_HORIZON_MINUTES = 10;
export const PROJECTION_PATHS = 2000;
/** Un choc plus ancien que cela n'est plus « récent » : la projection reste disponible mais n'est plus mise en avant. */
export const RECENT_SHOCK_MINUTES = 10;
/** La volatilité redescend vers sa valeur normale avec cette demi-vie. */
const VOL_HALF_LIFE_MINUTES = 5;
const MIN_RETURNS = 3;
const VOL_FLOOR = 0.0001;

export interface FanPoint {
  minute: number;
  bas_5: number;
  bas_25: number;
  median: number;
  haut_75: number;
  haut_95: number;
}

export interface ShockScenario {
  id: 'retour' | 'rebond_partiel' | 'continuation';
  titre: string;
  /** Explication sans chiffre : les chiffres sont dans les champs numériques. */
  description: string;
  niveau_cible: number;
  variation_vs_prix_actuel_pct: number;
  trajectoire: Array<{ minute: number; prix: number }>;
}

export interface ShockProjection {
  actif: string;
  choc: {
    id: string;
    minute: number;
    type: string;
    titre: string;
    prix_avant: number;
    prix_apres: number;
    variation_pct: number;
    minutes_ecoulees: number;
    recent: boolean;
  };
  minute_actuelle: number;
  prix_actuel: number;
  horizon_minutes: number;
  volatilite: {
    avant_choc_par_minute_pct: number | null;
    apres_choc_par_minute_pct: number | null;
    utilisee_au_depart_par_minute_pct: number;
  };
  /** Les dernières minutes réelles autour du choc, pour voir la chute avant l'éventail. */
  historique: Array<{ minute: number; prix: number }>;
  eventail: FanPoint[];
  scenarios: ShockScenario[];
  probabilites: {
    repasse_par_le_niveau_d_avant_pct: number;
    finit_au_dessus_du_prix_actuel_pct: number;
    finit_sous_le_prix_actuel_pct: number;
  };
  ta_position?: {
    quantite: number;
    valeur: number;
    gain_perte_si_bas_5: number;
    gain_perte_si_haut_95: number;
    stop_loss: number | null;
    probabilite_stop_touche_pct: number | null;
  };
  avertissement: string;
}

export const PROJECTION_WARNING =
  'Ce sont des scénarios et une fourchette calculés à partir de la volatilité de la salle, pas une prévision : personne ne sait où ira le prix. Les scénarios nommés sont des hypothèses, pas des probabilités.';

const pctOf = (fraction: number) => round(fraction * 100, 2);

/** Tous les chocs de marché (prix, volatilité, spread, liquidité, baleine) déjà survenus. */
export function allShocks(session: SessionData, now?: number): SimEvent[] {
  const maxMinute = now !== undefined ? now : Math.max(currentMinute(session), ...(session.events?.map((e) => e.minute) ?? [0]));
  return (session.events ?? [])
    .filter((e) => (SHOCK_EVENT_TYPES as readonly string[]).includes(e.type) && e.minute <= maxMinute + 0.05)
    .sort((a, b) => a.minute - b.minute);
}

/** Dernier choc de marché (prix, volatilité, grosse transaction) déjà survenu. */
export function latestShock(session: SessionData, now?: number): SimEvent | undefined {
  return allShocks(session, now).at(-1);
}

/** Rendements logarithmiques minute par minute entre deux minutes (incluses). */
function logReturns(session: SessionData, symbol: string, from: number, to: number): number[] {
  const out: number[] = [];
  for (let m = Math.max(1, from); m <= to; m += 1) {
    const a = priceAt(session.prices, symbol, m - 1);
    const b = priceAt(session.prices, symbol, m);
    if (a !== undefined && b !== undefined && a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

function stdDev(values: number[]): number | null {
  if (values.length < MIN_RETURNS) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))]!;

export interface ProjectionOptions {
  shockId?: string;
  participantId?: string;
  /** Actif visé ; sinon celui que le choc a le plus déplacé. */
  symbol?: string;
  horizon?: number;
  /** Graine : mêmes entrées, mêmes chiffres. */
  seedKey?: string;
  paths?: number;
}

export function projectAfterShock(session: SessionData, options: ProjectionOptions = {}): ShockProjection | null {
  const shocks = allShocks(session);
  if (shocks.length === 0) return null;
  const shock = options.shockId ? (shocks.find((s) => s.id === options.shockId) ?? shocks.at(-1)!) : shocks.at(-1)!;
  if (!shock) return null;

  const now = Math.max(shock.minute, currentMinute(session));
  const remaining = session.durationMinutes - now;
  if (remaining <= 0) return null;
  const horizon = Math.max(1, Math.min(Math.trunc(options.horizon ?? MAX_HORIZON_MINUTES), MAX_HORIZON_MINUTES, remaining));

  // Actif : celui demandé, sinon celui que le choc a le plus déplacé.
  const afterMinute = Math.min(now, Math.ceil(shock.minute) + 1);
  const beforeMinute = Math.max(0, Math.floor(shock.minute) - 1);
  const moveOf = (symbol: string) => {
    const before = priceAt(session.prices, symbol, beforeMinute) ?? priceAt(session.prices, symbol, 0);
    const after = priceAt(session.prices, symbol, afterMinute) ?? before;
    return before !== undefined && after !== undefined && before > 0 ? { before, after, move: after / before - 1 } : null;
  };
  const candidates = (options.symbol && session.symbols.includes(options.symbol) ? [options.symbol] : session.symbols)
    .map((symbol) => ({ symbol, ...moveOf(symbol) }))
    .filter((c): c is { symbol: string; before: number; after: number; move: number } => 'move' in c && c.move !== undefined);
  if (candidates.length === 0) return null;
  const chosen = [...candidates].sort((a, b) => Math.abs(b.move) - Math.abs(a.move))[0]!;
  const { symbol, before, after, move } = chosen;
  const current = priceAt(session.prices, symbol, now) ?? after;
  if (current === undefined || current <= 0) return null;

  // Volatilité : avant le choc, après le choc, puis valeur de départ de la simulation.
  const sigmaBefore = stdDev(logReturns(session, symbol, shock.minute - 30, shock.minute - 1));
  const sigmaAfter = stdDev(logReturns(session, symbol, shock.minute + 2, now));
  const sigmaNormal = Math.max(sigmaBefore ?? 0, VOL_FLOOR);
  const sigmaStart = Math.max(sigmaNormal, sigmaAfter ?? 0, Math.abs(Math.log(after / before)) / 4, VOL_FLOOR);

  // Simulation : aucune direction imposée (l'espérance du prix reste constante), volatilité qui redescend vers la normale.
  const paths = options.paths ?? PROJECTION_PATHS;
  const random = seededRandom(hashSeed(`${options.seedKey ?? session.sessionId}:${session.run}:${shock.id}:${symbol}:${now}:${horizon}`));
  const held = options.participantId ? liveState(session, options.participantId).positions.find((p) => p.symbol === symbol) : undefined;
  const stop = held?.stopLoss ?? null;
  const steps: number[][] = Array.from({ length: horizon }, () => []);
  let touchedBefore = 0;
  let stopTouched = 0;
  const downShock = before > current;
  for (let s = 0; s < paths; s += 1) {
    let x = 0;
    let touched = false;
    let stopped = false;
    for (let t = 0; t < horizon; t += 1) {
      const sigma = sigmaNormal + (sigmaStart - sigmaNormal) * 0.5 ** (t / VOL_HALF_LIFE_MINUTES);
      x += -0.5 * sigma * sigma + sigma * gaussian(random);
      const price = current * Math.exp(x);
      steps[t]!.push(price);
      if (downShock ? price >= before : price <= before) touched = true;
      if (stop !== null && price <= stop) stopped = true;
    }
    if (touched) touchedBefore += 1;
    if (stopped) stopTouched += 1;
  }
  const sortedSteps = steps.map((values) => values.sort((a, b) => a - b));
  const eventail: FanPoint[] = [
    { minute: now, bas_5: roundPrice(current), bas_25: roundPrice(current), median: roundPrice(current), haut_75: roundPrice(current), haut_95: roundPrice(current) },
    ...sortedSteps.map((sorted, t) => ({
      minute: now + t + 1,
      bas_5: roundPrice(quantile(sorted, 0.05)),
      bas_25: roundPrice(quantile(sorted, 0.25)),
      median: roundPrice(quantile(sorted, 0.5)),
      haut_75: roundPrice(quantile(sorted, 0.75)),
      haut_95: roundPrice(quantile(sorted, 0.95)),
    })),
  ];
  const finals = sortedSteps[horizon - 1]!;
  const above = finals.filter((p) => p > current).length / paths;

  // Scénarios : trajectoires centrales vers une cible (hypothèses).
  const gap = before - current;
  const scenarioDefs: Array<{ id: ShockScenario['id']; titre: string; description: string; target: number }> =
    Math.abs(gap) / current < 0.0005
      ? []
      : [
          {
            id: 'retour',
            titre: 'Retour au niveau d’avant',
            description: 'Les opérateurs jugent la réaction excessive : le prix revient vers son niveau d’avant le choc.',
            target: before,
          },
          {
            id: 'rebond_partiel',
            titre: 'Rebond partiel',
            description: 'Le prix récupère une partie du choc puis se stabilise : une partie de la nouvelle information est jugée justifiée.',
            target: current + gap * 0.5,
          },
          {
            id: 'continuation',
            titre: 'Continuation',
            description: 'Le choc se prolonge : le mouvement continue dans la même direction avant de se calmer.',
            target: current - gap * 0.5,
          },
        ];
  const scenarios: ShockScenario[] = scenarioDefs
    .filter((d) => d.target > 0)
    .map((d) => ({
      id: d.id,
      titre: d.titre,
      description: d.description,
      niveau_cible: roundPrice(d.target),
      variation_vs_prix_actuel_pct: pctOf(d.target / current - 1),
      trajectoire: Array.from({ length: horizon + 1 }, (_, t) => ({
        minute: now + t,
        prix: roundPrice(current * Math.exp((Math.log(d.target / current) * t) / horizon)),
      })),
    }));

  const projection: ShockProjection = {
    actif: symbol,
    choc: {
      id: shock.id,
      minute: round(shock.minute, 2),
      type: shock.type,
      titre: shock.label.replace(/[\r\n<>]/g, ' ').trim().slice(0, 140),
      prix_avant: roundPrice(before),
      prix_apres: roundPrice(after),
      variation_pct: pctOf(move),
      minutes_ecoulees: round(now - shock.minute, 1),
      recent: now - shock.minute <= RECENT_SHOCK_MINUTES,
    },
    minute_actuelle: now,
    prix_actuel: roundPrice(current),
    horizon_minutes: horizon,
    volatilite: {
      avant_choc_par_minute_pct: sigmaBefore === null ? null : pctOf(sigmaBefore),
      apres_choc_par_minute_pct: sigmaAfter === null ? null : pctOf(sigmaAfter),
      utilisee_au_depart_par_minute_pct: pctOf(sigmaStart),
    },
    historique: Array.from({ length: Math.max(1, Math.round(now) - Math.max(0, Math.floor(shock.minute) - 4) + 1) }, (_, i) => {
      const minute = Math.max(0, Math.floor(shock.minute) - 4) + i;
      return { minute, prix: roundPrice(priceAt(session.prices, symbol, minute) ?? current) };
    }),
    eventail,
    scenarios,
    probabilites: {
      repasse_par_le_niveau_d_avant_pct: pctOf(touchedBefore / paths),
      finit_au_dessus_du_prix_actuel_pct: pctOf(above),
      finit_sous_le_prix_actuel_pct: pctOf(1 - above),
    },
    avertissement: PROJECTION_WARNING,
  };
  if (held) {
    const low = quantile(finals, 0.05);
    const high = quantile(finals, 0.95);
    projection.ta_position = {
      quantite: held.quantity,
      valeur: held.value,
      gain_perte_si_bas_5: round((low - current) * held.quantity, 2),
      gain_perte_si_haut_95: round((high - current) * held.quantity, 2),
      stop_loss: stop,
      probabilite_stop_touche_pct: stop === null ? null : pctOf(stopTouched / paths),
    };
  }
  return projection;
}

/** Texte pédagogique écrit par le code (sans modèle) : lecture de la projection, sans prédiction ni conseil d'ordre. */
export function describeProjection(p: ShockProjection): string {
  const f = (n: number) => String(n).replace('.', ',');
  const direction = p.choc.variation_pct < 0 ? 'baissé' : 'monté';
  const lines: string[] = [];
  lines.push(
    `Minute ${p.choc.minute} : « ${p.choc.titre} ». ${p.actif} a ${direction} de ${f(Math.abs(p.choc.variation_pct))} % (de ${f(p.choc.prix_avant)} à ${f(p.choc.prix_apres)}). Il cote maintenant ${f(p.prix_actuel)}.`,
  );
  const last = p.eventail.at(-1)!;
  lines.push(
    `D’après la volatilité mesurée dans la salle, le modèle place le prix entre ${f(last.bas_5)} et ${f(last.haut_95)} dans 9 cas sur 10 d’ici ${p.horizon_minutes} minute${p.horizon_minutes > 1 ? 's' : ''} (médiane ${f(last.median)}). ` +
      `La probabilité que le prix repasse par son niveau d’avant le choc (${f(p.choc.prix_avant)}) est de ${f(p.probabilites.repasse_par_le_niveau_d_avant_pct)} %.`,
  );
  if (p.scenarios.length > 0) {
    lines.push(
      'Trois scénarios à garder en tête : ' +
        p.scenarios.map((s) => `${s.titre} (vers ${f(s.niveau_cible)})`).join(', ') +
        '.',
    );
  }
  if (p.ta_position) {
    const stopPart =
      p.ta_position.stop_loss !== null && p.ta_position.probabilite_stop_touche_pct !== null
        ? ` Ton stop-loss à ${f(p.ta_position.stop_loss)} a ${f(p.ta_position.probabilite_stop_touche_pct)} % de chances d’être touché dans cette fourchette.`
        : ' Tu n’as pas de stop-loss sur cette position.';
    lines.push(
      `Sur tes ${f(p.ta_position.quantite)} ${p.actif}, la fourchette représente ${f(p.ta_position.gain_perte_si_bas_5)} $ dans les pires cas probables et ${f(p.ta_position.gain_perte_si_haut_95)} $ dans les meilleurs.${stopPart}`,
    );
  }
  lines.push(p.avertissement);
  return lines.join(' ');
}
