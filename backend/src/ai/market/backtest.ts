import { round } from '../contract/equity.js';
import { analyzeHistory, readAsset, type Bias } from './analysis.js';
import type { AssetHistory } from './history.js';
import { mean } from './indicators.js';

/**
 * Backtest HONNÊTE de la lecture « règles simples » (tendance + élan + cassure) :
 * à chaque jour passé, on recalcule le biais avec les seules données connues ce jour-là,
 * puis on regarde ce qui s'est réellement passé les N jours suivants. Aucune optimisation de
 * paramètres, donc pas de sur-ajustement : c'est exactement la règle utilisée par `analyze_asset`.
 * Les chiffres restent descriptifs : l'échantillon est court (quelques mois) et les observations
 * successives se chevauchent, ce que la sortie rappelle.
 */

export const WARMUP = 50;
export const MIN_RELIABLE = 20;

export interface Observation {
  bias: Bias;
  forward: number;
}

const pct = (fraction: number) => round(fraction * 100, 2);

function stats(values: number[], success: (r: number) => boolean) {
  if (values.length === 0) return { observations: 0 };
  return {
    observations: values.length,
    taux_de_reussite_pct: pct(values.filter(success).length / values.length),
    rendement_moyen_pct: pct(mean(values)),
    meilleur_cas_pct: pct(Math.max(...values)),
    pire_cas_pct: pct(Math.min(...values)),
    fiabilite: values.length >= MIN_RELIABLE ? 'moyenne (échantillon court)' : 'faible (trop peu d’observations)',
  };
}

/** Un signal par jour passé, calculé avec les seules bougies connues ce jour-là. */
export function observe(history: AssetHistory, forwardDays: number): Observation[] {
  const candles = history.candles;
  const observations: Observation[] = [];
  for (let i = WARMUP; i + forwardDays < candles.length; i += 1) {
    const past: AssetHistory = { ...history, candles: candles.slice(0, i + 1) };
    const month = analyzeHistory(past, 'mois');
    if (!month) continue;
    const reading = readAsset(month, month.returnFraction);
    const entry = candles[i]!.close;
    const exit = candles[i + forwardDays]!.close;
    if (entry > 0) observations.push({ bias: reading.bias, forward: exit / entry - 1 });
  }
  return observations;
}

export function backtestSignal(history: AssetHistory, forwardDays: number) {
  const observations = observe(history, forwardDays);
  if (observations.length === 0) return null;

  const of = (bias: Bias) => observations.filter((o) => o.bias === bias).map((o) => o.forward);
  const all = observations.map((o) => o.forward);
  const bullish = of('haussier');
  const bearish = of('baissier');
  const current = analyzeHistory(history, 'mois');
  const currentBias = current ? readAsset(current, current.returnFraction).bias : null;
  return {
    forwardDays,
    tested: observations.length,
    bullish: stats(bullish, (r) => r > 0),
    bearish: stats(bearish, (r) => r < 0),
    neutral: stats(of('neutre'), (r) => r > 0),
    reference: { observations: all.length, up: all.filter((r) => r > 0).length / all.length, average: mean(all) },
    edgeBullish: bullish.length > 0 ? mean(bullish) - mean(all) : null,
    edgeBearish: bearish.length > 0 ? mean(all) - mean(bearish) : null,
    currentBias,
  };
}

export function describeBacktest(result: NonNullable<ReturnType<typeof backtestSignal>>) {
  return {
    horizon_apres_signal_jours: result.forwardDays,
    jours_testes: result.tested,
    signal_haussier: result.bullish,
    signal_baissier: { ...result.bearish, note: 'Pour un signal baissier, « réussite » = le prix a effectivement baissé ensuite.' },
    signal_neutre: result.neutral,
    reference_tous_les_jours: {
      observations: result.reference.observations,
      part_de_hausses_pct: pct(result.reference.up),
      rendement_moyen_pct: pct(result.reference.average),
    },
    avantage_du_signal_haussier_vs_reference_pct: result.edgeBullish === null ? null : pct(result.edgeBullish),
    avantage_du_signal_baissier_vs_reference_pct: result.edgeBearish === null ? null : pct(result.edgeBearish),
    biais_actuel: result.currentBias,
    limites:
      'Historique court (quelques mois) et observations qui se chevauchent : l’échantillon réel est plus petit que le nombre affiché. Résultats passés, aucune garantie pour la suite ; un signal peut sembler bon par hasard.',
  };
}
