import type { Evidence, ParticipantMetrics } from '../metrics/metrics.js';

/**
 * Barème d'évaluation : critères, seuils et pondérations VISIBLES.
 *
 * C'est le code qui attribue les notes, à partir des métriques et de ce
 * barème. Le modèle de langage rédige les commentaires mais ne choisit jamais
 * une note. Chaque note garde la règle qui l'a produite, pour répondre à
 * « pourquoi cette note ? ».
 *
 * Les seuils par défaut sont des choix pédagogiques : l'enseignant peut les
 * remplacer en fournissant un autre `Rubric` pour son scénario.
 */

export type MetricKey = 'maxExposure' | 'maxDrawdown' | 'stopLossRatio' | 'reactivity' | 'payoffRatio';
export type Unit = 'percent' | 'ratio' | 'minutes';

export interface Band {
  /** Seuil d'appartenance ; null = « sinon » (dernière tranche). */
  threshold: number | null;
  score: number;
  /** Qualificatif affiché (« bonne », « insuffisante »…). */
  label: string;
}

export interface CriterionDefinition {
  id: string;
  label: string;
  /** Poids relatif (renormalisé sur les critères évaluables). */
  weight: number;
  metric: MetricKey;
  unit: Unit;
  /** lower : la valeur est bonne quand elle est basse (tranches ordonnées de la meilleure à la pire). */
  direction: 'lower_is_better' | 'higher_is_better';
  bands: Band[];
}

export interface Rubric {
  id: string;
  version: string;
  outOf: number;
  criteria: CriterionDefinition[];
}

export const DEFAULT_RUBRIC: Rubric = {
  id: 'alpharoom-default',
  version: 'v1',
  outOf: 4,
  criteria: [
    {
      id: 'gestion_risque',
      label: 'Gestion du risque',
      weight: 0.3,
      metric: 'maxExposure',
      unit: 'percent',
      direction: 'lower_is_better',
      bands: [
        { threshold: 40, score: 4, label: 'maîtrisée' },
        { threshold: 60, score: 3, label: 'correcte' },
        { threshold: 80, score: 2, label: 'à surveiller' },
        { threshold: null, score: 1, label: 'insuffisante' },
      ],
    },
    {
      id: 'maitrise_pertes',
      label: 'Maîtrise des pertes',
      weight: 0.2,
      metric: 'maxDrawdown',
      unit: 'percent',
      direction: 'lower_is_better',
      bands: [
        { threshold: 2, score: 4, label: 'très bonne' },
        { threshold: 5, score: 3, label: 'bonne' },
        { threshold: 10, score: 2, label: 'à surveiller' },
        { threshold: null, score: 1, label: 'insuffisante' },
      ],
    },
    {
      id: 'protection_positions',
      label: 'Protection des positions',
      weight: 0.2,
      metric: 'stopLossRatio',
      unit: 'percent',
      direction: 'higher_is_better',
      bands: [
        { threshold: 75, score: 4, label: 'systématique' },
        { threshold: 50, score: 3, label: 'fréquente' },
        { threshold: 25, score: 2, label: 'à améliorer' },
        { threshold: null, score: 1, label: 'quasi absente' },
      ],
    },
    {
      id: 'reactivite',
      label: 'Réaction aux événements',
      weight: 0.15,
      metric: 'reactivity',
      unit: 'minutes',
      direction: 'lower_is_better',
      bands: [
        { threshold: 2, score: 4, label: 'rapide' },
        { threshold: 5, score: 3, label: 'correcte' },
        { threshold: null, score: 2, label: 'tardive' },
      ],
    },
    {
      id: 'qualite_sorties',
      label: 'Qualité des sorties',
      weight: 0.15,
      metric: 'payoffRatio',
      unit: 'ratio',
      direction: 'higher_is_better',
      bands: [
        { threshold: 1.5, score: 4, label: 'très bonne' },
        { threshold: 1, score: 3, label: 'bonne' },
        { threshold: 0.5, score: 2, label: 'à améliorer' },
        { threshold: null, score: 1, label: 'faible' },
      ],
    },
  ],
};

/** Note d'un critère, avec la règle qui l'a produite et les preuves. */
export interface CriterionScore {
  id: string;
  label: string;
  weight: number;
  status: 'evaluated' | 'not_evaluable';
  /** Valeur mesurée dans l'unité du critère (92 pour 92 %). */
  value: number | null;
  /** Valeur lisible (« 92 % »). */
  displayValue: string | null;
  score: number | null;
  outOf: number;
  /** Phrase expliquant la règle appliquée. */
  rule: string;
  /** Pourquoi le critère n'a pas pu être évalué. */
  reason?: string;
  evidence: Evidence[];
}

export interface OverallScore {
  /** Moyenne pondérée sur les critères évaluables (null si aucun). */
  score: number | null;
  outOf: number;
  evaluated: number;
  total: number;
  /** Vrai quand des critères n'ont pas pu être évalués. */
  partial: boolean;
}

/** Nombre au format français, sans espace insécable (1 décimale au plus si utile). */
export function formatNumber(value: number, maxDecimals = 1): string {
  const rounded = Number(value.toFixed(maxDecimals));
  return String(rounded).replace('.', ',');
}

export function formatValue(value: number, unit: Unit): string {
  if (unit === 'percent') return `${formatNumber(value)} %`;
  if (unit === 'minutes') return `${formatNumber(value)} min`;
  return formatNumber(value, 2);
}

function pickBand(definition: CriterionDefinition, value: number): { band: Band; index: number } {
  const { bands, direction } = definition;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index]!;
    if (band.threshold === null) return { band, index };
    if (direction === 'lower_is_better' ? value <= band.threshold : value >= band.threshold) return { band, index };
  }
  const index = bands.length - 1;
  return { band: bands[index]!, index };
}

/** Condition de la tranche en clair : « jusqu'à 40 % », « au-delà de 80 % »… */
function describeBand(definition: CriterionDefinition, index: number): string {
  const { bands, direction, unit } = definition;
  const band = bands[index]!;
  const previous = index > 0 ? bands[index - 1]!.threshold : null;
  const fmt = (n: number) => formatValue(n, unit);
  if (direction === 'lower_is_better') {
    if (band.threshold !== null) return `jusqu'à ${fmt(band.threshold)}`;
    return previous === null ? 'dans tous les autres cas' : `au-delà de ${fmt(previous)}`;
  }
  if (band.threshold !== null) return `à partir de ${fmt(band.threshold)}`;
  return previous === null ? 'dans tous les autres cas' : `en dessous de ${fmt(previous)}`;
}

/** Valeur mesurée d'un critère, ou la raison pour laquelle elle est indisponible. */
function measure(
  definition: CriterionDefinition,
  metrics: ParticipantMetrics,
  windowMinutes: number,
): { value: number | null; evidence: Evidence[]; reason?: string; special?: 'no_reaction'; events?: number } {
  switch (definition.metric) {
    case 'maxExposure':
      if (metrics.tradeCount === 0) return { value: null, evidence: [], reason: 'Aucune exécution : pas d’exposition à juger.' };
      return { value: metrics.maxExposure.value * 100, evidence: metrics.maxExposure.evidence };
    case 'maxDrawdown':
      if (metrics.tradeCount === 0) return { value: null, evidence: [], reason: 'Aucune exécution : pas de perte à juger.' };
      return { value: Math.abs(metrics.maxDrawdown.value) * 100, evidence: metrics.maxDrawdown.evidence };
    case 'stopLossRatio':
      if (metrics.stopLossRatio.value === null) return { value: null, evidence: [], reason: 'Aucune position ouverte.' };
      return { value: metrics.stopLossRatio.value * 100, evidence: metrics.stopLossRatio.evidence };
    case 'payoffRatio':
      if (metrics.payoffRatio.value === null) {
        return { value: null, evidence: [], reason: 'Il faut au moins une position gagnante et une perdante fermées.' };
      }
      return { value: metrics.payoffRatio.value, evidence: metrics.payoffRatio.evidence };
    case 'reactivity': {
      const delays = metrics.reactionDelays.value;
      if (metrics.tradeCount === 0) return { value: null, evidence: [], reason: 'Aucune exécution : pas de réaction à juger.' };
      if (delays.length === 0) return { value: null, evidence: [], reason: 'Aucun événement de marché dans la séance.' };
      const reacted = delays.filter((d) => d.minutes !== null);
      if (reacted.length === 0) {
        return {
          value: null,
          evidence: metrics.reactionDelays.evidence,
          special: 'no_reaction',
          events: delays.length,
          reason: `Aucune exécution dans les ${windowMinutes} minutes suivant les ${delays.length} événement(s).`,
        };
      }
      const mean = reacted.reduce((sum, d) => sum + (d.minutes as number), 0) / reacted.length;
      return { value: mean, evidence: metrics.reactionDelays.evidence };
    }
  }
}

export function scoreCriterion(
  definition: CriterionDefinition,
  metrics: ParticipantMetrics,
  rubric: Rubric,
  windowMinutes = 10,
): CriterionScore {
  const base = {
    id: definition.id,
    label: definition.label,
    weight: definition.weight,
    outOf: rubric.outOf,
  };
  const measured = measure(definition, metrics, windowMinutes);

  // Aucune réaction du tout : note la plus basse du critère, règle explicite.
  if (measured.special === 'no_reaction') {
    const worst = definition.bands.at(-1)!;
    const worstScore = Math.min(...definition.bands.map((b) => b.score));
    return {
      ...base,
      status: 'evaluated',
      value: null,
      displayValue: 'aucune réaction',
      score: worstScore,
      rule: `${definition.label} : aucune exécution dans les ${windowMinutes} minutes suivant les ${measured.events} événement(s) → ${worst.label}, ${worstScore}/${rubric.outOf}.`,
      evidence: measured.evidence,
    };
  }

  if (measured.value === null) {
    return {
      ...base,
      status: 'not_evaluable',
      value: null,
      displayValue: null,
      score: null,
      rule: `${definition.label} : non évalué.`,
      reason: measured.reason,
      evidence: [],
    };
  }

  const { band, index } = pickBand(definition, measured.value);
  const displayValue = formatValue(measured.value, definition.unit);
  return {
    ...base,
    status: 'evaluated',
    value: Math.round(measured.value * 100) / 100,
    displayValue,
    score: band.score,
    rule: `${definition.label} : ${displayValue}, règle « ${describeBand(definition, index)} » → ${band.label}, ${band.score}/${rubric.outOf}.`,
    evidence: measured.evidence,
  };
}

export function computeOverall(
  criteria: Array<Pick<CriterionScore, 'status' | 'score' | 'weight'> & { teacherScore?: number | null }>,
  outOf: number,
): OverallScore {
  const evaluated = criteria.filter((c) => c.status === 'evaluated' && (c.teacherScore ?? c.score) !== null);
  const totalWeight = evaluated.reduce((sum, c) => sum + c.weight, 0);
  const score =
    evaluated.length === 0 || totalWeight === 0
      ? null
      : Math.round(
          (evaluated.reduce((sum, c) => sum + c.weight * ((c.teacherScore ?? c.score) as number), 0) / totalWeight) * 100,
        ) / 100;
  return { score, outOf, evaluated: evaluated.length, total: criteria.length, partial: evaluated.length < criteria.length };
}

export function scoreParticipant(
  metrics: ParticipantMetrics,
  rubric: Rubric = DEFAULT_RUBRIC,
  windowMinutes = 10,
): { criteria: CriterionScore[]; overall: OverallScore } {
  const criteria = rubric.criteria.map((definition) => scoreCriterion(definition, metrics, rubric, windowMinutes));
  return { criteria, overall: computeOverall(criteria, rubric.outOf) };
}
