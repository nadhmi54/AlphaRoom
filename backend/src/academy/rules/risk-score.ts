/**
 * « Score Académie » : score ajusté du risque, propre au module Academy. Il ne
 * remplace ni ne modifie aucun score de la Game Room : il sert uniquement à
 * décider des récompenses.
 *
 * Fonctions pures : ni base, ni réseau. Les pondérations sont configurables
 * (portées par les conditions d'une règle) avec des valeurs par défaut.
 *
 * Le score (0 à 100) combine trois composantes normalisées puis pondérées :
 *   - rendement  : `returnPercent / targetReturnPercent`, borné à [0, 1] ;
 *   - Sharpe     : `sharpe / targetSharpe`, borné à [0, 1] ;
 *   - drawdown   : `1 − maxDrawdown / drawdownLimit`, borné à [0, 1].
 * Un rendement, un Sharpe ou une donnée manquante vaut 0 (prudence) ; un
 * drawdown inconnu vaut 0 lui aussi plutôt que le meilleur cas.
 */

export interface ScoreWeights {
  returnPercent: number;
  sharpe: number;
  drawdown: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  returnPercent: 0.4,
  sharpe: 0.3,
  drawdown: 0.3,
};

export const DEFAULT_TARGET_RETURN_PERCENT = 10;
export const DEFAULT_TARGET_SHARPE = 2;
export const DEFAULT_DRAWDOWN_LIMIT = 0.2;

export interface ScoreMetrics {
  returnPercent?: number | null;
  sharpe?: number | null;
  maxDrawdown?: number | null;
}

export interface ScoreOptions {
  weights?: Partial<ScoreWeights> | null;
  targetReturnPercent?: number | null;
  targetSharpe?: number | null;
  drawdownLimit?: number | null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function positiveOr(value: unknown, fallback: number): number {
  return isNumber(value) && value > 0 ? value : fallback;
}

/** Accepte zéro comme poids explicite ; seules les valeurs négatives ou absentes retombent sur le défaut. */
function nonNegativeOr(value: unknown, fallback: number): number {
  return isNumber(value) && value >= 0 ? value : fallback;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Ramène les pondérations à une somme de 1. Un poids négatif ou absent retombe
 * sur le défaut ; un poids nul explicite est conservé (composante ignorée).
 */
export function normalizeWeights(weights?: Partial<ScoreWeights> | null): ScoreWeights {
  const merged: ScoreWeights = {
    returnPercent: nonNegativeOr(weights?.returnPercent, DEFAULT_SCORE_WEIGHTS.returnPercent),
    sharpe: nonNegativeOr(weights?.sharpe, DEFAULT_SCORE_WEIGHTS.sharpe),
    drawdown: nonNegativeOr(weights?.drawdown, DEFAULT_SCORE_WEIGHTS.drawdown),
  };
  const sum = merged.returnPercent + merged.sharpe + merged.drawdown;
  if (sum <= 0) return { ...DEFAULT_SCORE_WEIGHTS };
  return {
    returnPercent: merged.returnPercent / sum,
    sharpe: merged.sharpe / sum,
    drawdown: merged.drawdown / sum,
  };
}

/**
 * Composante « rendement » : un rendement négatif ou inconnu vaut 0, un
 * rendement égal à la cible vaut 1 (au-delà, plafonné à 1).
 */
function returnComponent(returnPercent: unknown, target: number): number {
  if (!isNumber(returnPercent) || returnPercent <= 0) return 0;
  return clamp01(returnPercent / target);
}

/** Composante « Sharpe » : même principe, un Sharpe négatif ou inconnu vaut 0. */
function sharpeComponent(sharpe: unknown, target: number): number {
  if (!isNumber(sharpe) || sharpe <= 0) return 0;
  return clamp01(sharpe / target);
}

/**
 * Composante « respect du drawdown » : 1 sans drawdown, 0 dès que la limite est
 * atteinte ou dépassée, et 0 si le drawdown est inconnu (prudence).
 */
function drawdownComponent(maxDrawdown: unknown, limit: number): number {
  if (!isNumber(maxDrawdown) || maxDrawdown < 0) return 0;
  return clamp01(1 - maxDrawdown / limit);
}

/** Calcule le Score Académie (0 à 100), arrondi au centième. */
export function computeRiskAdjustedScore(
  metrics: ScoreMetrics | null | undefined,
  options: ScoreOptions = {},
): number {
  const safeMetrics = metrics ?? {};
  const weights = normalizeWeights(options.weights);
  const targetReturn = positiveOr(options.targetReturnPercent, DEFAULT_TARGET_RETURN_PERCENT);
  const targetSharpe = positiveOr(options.targetSharpe, DEFAULT_TARGET_SHARPE);
  const drawdownLimit = positiveOr(options.drawdownLimit, DEFAULT_DRAWDOWN_LIMIT);

  const score =
    100 *
    (weights.returnPercent * returnComponent(safeMetrics.returnPercent, targetReturn) +
      weights.sharpe * sharpeComponent(safeMetrics.sharpe, targetSharpe) +
      weights.drawdown * drawdownComponent(safeMetrics.maxDrawdown, drawdownLimit));

  return round2(score);
}
