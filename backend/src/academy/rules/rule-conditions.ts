import {
  evaluateMission,
  type CriterionCheck,
  type MissionCriteria,
  type MissionMetrics,
} from '../missions/mission-criteria.js';
import { computeRiskAdjustedScore, type ScoreWeights } from './risk-score.js';

/**
 * Conditions d'une règle de déblocage, évaluées uniquement côté serveur à
 * partir des résultats enregistrés. Elles étendent les critères de mission
 * (minimum d'ordres et de durée, drawdown maximal, Sharpe minimal...) avec le
 * seuil du Score Académie et ses pondérations configurables.
 *
 * `maxDrawdownLimit` est un verrou dur : dépasser la limite fait échouer la
 * règle, donc aucune récompense. `drawdownLimit` ne sert qu'à normaliser la
 * composante « respect du drawdown » du Score Académie.
 */
export interface RuleConditions extends MissionCriteria {
  /** Score Académie minimal exigé (0 à 100). */
  minScore?: number;
  /** Pondérations du Score Académie (somme normalisée à 1). */
  weights?: Partial<ScoreWeights>;
  targetReturnPercent?: number;
  targetSharpe?: number;
  drawdownLimit?: number;
  /** Série de jours minimale (déclencheur `streak_days`). */
  minStreakDays?: number;
  /** Restreint la règle à un scénario (défi rattaché à un `scenario_id`). */
  scenarioId?: string;
}

/** Contexte d'évaluation non métrique (série de jours, scénario de la partie). */
export interface RuleContext {
  streakDays?: number | null;
  scenarioId?: string | null;
}

export interface RuleEvaluation {
  passed: boolean;
  /** Score Académie calculé pour l'événement. */
  score: number;
  checks: CriterionCheck[];
  /** Libellés de ce qui manque pour satisfaire la règle. */
  missing: string[];
}

const NUMERIC_KEYS = [
  'minScore',
  'minReturnPercent',
  'maxDrawdownLimit',
  'minSharpe',
  'minOrders',
  'minAssets',
  'minDurationSeconds',
  'maxDurationSeconds',
  'targetReturnPercent',
  'targetSharpe',
  'drawdownLimit',
  'minStreakDays',
] as const;

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Lit les conditions d'une règle depuis son JSON brut. Les clés inconnues sont
 * ignorées pour rester tolérant aux évolutions ; les valeurs non numériques
 * sont écartées plutôt que de propager une donnée invalide dans l'évaluation.
 */
export function readRuleConditions(raw: unknown): RuleConditions {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const conditions: Record<string, unknown> = {};

  for (const key of NUMERIC_KEYS) {
    const value = readNumber(source[key]);
    if (value !== null) conditions[key] = value;
  }

  if (typeof source.scenarioId === 'string' && source.scenarioId.length > 0) {
    conditions.scenarioId = source.scenarioId;
  }

  const weights = source.weights;
  if (weights && typeof weights === 'object') {
    const raw = weights as Record<string, unknown>;
    const partial: Partial<ScoreWeights> = {};
    const returnPercent = readNumber(raw.returnPercent);
    const sharpe = readNumber(raw.sharpe);
    const drawdown = readNumber(raw.drawdown);
    if (returnPercent !== null) partial.returnPercent = returnPercent;
    if (sharpe !== null) partial.sharpe = sharpe;
    if (drawdown !== null) partial.drawdown = drawdown;
    conditions.weights = partial;
  }

  return conditions as RuleConditions;
}

/**
 * Évalue une règle : tous les critères exigés doivent être satisfaits, le score
 * doit atteindre `minScore`, la série de jours `minStreakDays`, et le scénario
 * doit correspondre s'il est imposé. Un critère absent n'est pas exigé ; un
 * critère présent avec une donnée manquante est non satisfait (prudence).
 */
export function evaluateRuleConditions(
  conditions: RuleConditions | null | undefined,
  metrics: MissionMetrics | null | undefined,
  context: RuleContext = {},
): RuleEvaluation {
  const safe = conditions ?? {};
  const missionEvaluation = evaluateMission(safe, metrics);
  const checks: CriterionCheck[] = [...missionEvaluation.checks];

  const score = computeRiskAdjustedScore(metrics, {
    weights: safe.weights,
    targetReturnPercent: safe.targetReturnPercent,
    targetSharpe: safe.targetSharpe,
    drawdownLimit: safe.drawdownLimit,
  });

  const minScore = readNumber(safe.minScore);
  if (minScore !== null) {
    checks.push({
      key: 'minScore',
      label: 'Score Académie minimal',
      required: minScore,
      actual: score,
      satisfied: score >= minScore,
    });
  }

  const minStreakDays = readNumber(safe.minStreakDays);
  if (minStreakDays !== null) {
    const streak = readNumber(context.streakDays);
    checks.push({
      key: 'minStreakDays',
      label: 'Série de jours minimale',
      required: minStreakDays,
      actual: streak,
      satisfied: streak !== null && streak >= minStreakDays,
    });
  }

  const missing = checks.filter((check) => !check.satisfied).map((check) => check.label);

  if (safe.scenarioId && safe.scenarioId !== (context.scenarioId ?? null)) {
    missing.push('Scénario attendu');
  }

  return { passed: missing.length === 0, score, checks, missing };
}
