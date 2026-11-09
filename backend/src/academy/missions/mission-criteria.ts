/**
 * Évaluation des critères de mission, en fonctions pures séparées du service :
 * ni base, ni réseau, ni horloge implicite. Le moteur de règles (Tâche 4) et le
 * service de missions s'appuient sur ces fonctions, testables à la main.
 *
 * Les critères sont stockés en JSON sur `academy_missions.criteria` et portent
 * sur les indicateurs d'une partie :
 *   - `minReturnPercent`   : rendement (%) au moins égal à la valeur ;
 *   - `maxDrawdownLimit`   : drawdown maximal toléré (fraction, ex. 0.2 = 20 %) ;
 *   - `minSharpe`          : ratio de Sharpe au moins égal à la valeur ;
 *   - `minOrders`          : nombre d'ordres au moins égal à la valeur ;
 *   - `minAssets`          : nombre d'actifs négociés au moins égal à la valeur ;
 *   - `minDurationSeconds` : durée de la séance (s) au moins égale à la valeur ;
 *   - `maxDurationSeconds` : durée de la séance (s) au plus égale à la valeur.
 *
 * Un critère absent n'est pas exigé. Un critère présent mais dont l'indicateur
 * est inconnu (valeur nulle) est considéré non satisfait : on ne réussit pas une
 * mission sur une donnée manquante. Les clés inconnues sont ignorées pour rester
 * tolérant à l'ajout de futurs critères.
 */

/** Indicateurs d'une partie nécessaires à l'évaluation. Tous optionnels. */
export interface MissionMetrics {
  returnPercent?: number | null;
  maxDrawdown?: number | null;
  sharpe?: number | null;
  ordersCount?: number | null;
  assetsCount?: number | null;
  durationSeconds?: number | null;
}

export interface CriterionCheck {
  key: string;
  label: string;
  required: number;
  actual: number | null;
  satisfied: boolean;
}

export interface MissionEvaluation {
  passed: boolean;
  checks: CriterionCheck[];
  /** Libellés des critères non satisfaits (ce qu'il manque pour réussir). */
  missing: string[];
}

interface CriterionDefinition {
  key: keyof MissionCriteria;
  label: string;
  metric: keyof MissionMetrics;
  test: (actual: number, required: number) => boolean;
}

/** Critères reconnus, dans l'ordre où ils sont rapportés. */
export interface MissionCriteria {
  minReturnPercent?: number;
  maxDrawdownLimit?: number;
  minSharpe?: number;
  minOrders?: number;
  minAssets?: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
}

const CRITERIA: CriterionDefinition[] = [
  {
    key: 'minReturnPercent',
    label: 'Rendement minimal',
    metric: 'returnPercent',
    test: (actual, required) => actual >= required,
  },
  {
    key: 'maxDrawdownLimit',
    label: 'Drawdown maximal autorisé',
    metric: 'maxDrawdown',
    test: (actual, required) => actual <= required,
  },
  {
    key: 'minSharpe',
    label: 'Ratio de Sharpe minimal',
    metric: 'sharpe',
    test: (actual, required) => actual >= required,
  },
  {
    key: 'minOrders',
    label: 'Nombre d’ordres minimal',
    metric: 'ordersCount',
    test: (actual, required) => actual >= required,
  },
  {
    key: 'minAssets',
    label: 'Nombre d’actifs minimal',
    metric: 'assetsCount',
    test: (actual, required) => actual >= required,
  },
  {
    key: 'minDurationSeconds',
    label: 'Durée minimale (s)',
    metric: 'durationSeconds',
    test: (actual, required) => actual >= required,
  },
  {
    key: 'maxDurationSeconds',
    label: 'Durée maximale (s)',
    metric: 'durationSeconds',
    test: (actual, required) => actual <= required,
  },
];

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Évalue une mission : tous les critères exigés doivent être satisfaits. */
export function evaluateMission(
  criteria: MissionCriteria | null | undefined,
  metrics: MissionMetrics | null | undefined,
): MissionEvaluation {
  const safeCriteria = criteria ?? {};
  const safeMetrics = metrics ?? {};

  const checks: CriterionCheck[] = [];
  for (const definition of CRITERIA) {
    const required = readNumber(safeCriteria[definition.key]);
    if (required === null) continue;

    const actual = readNumber(safeMetrics[definition.metric]);
    const satisfied = actual !== null && definition.test(actual, required);
    checks.push({
      key: definition.key,
      label: definition.label,
      required,
      actual,
      satisfied,
    });
  }

  const missing = checks.filter((check) => !check.satisfied).map((check) => check.label);
  return { passed: missing.length === 0, checks, missing };
}

/** Fenêtre de validité et activation d'une mission ou d'un défi, à une date donnée. */
export interface MissionWindow {
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

export function isMissionOpen(mission: MissionWindow, now: Date = new Date()): boolean {
  if (!mission.isActive) return false;
  if (mission.startsAt && now < mission.startsAt) return false;
  if (mission.endsAt && now > mission.endsAt) return false;
  return true;
}

/**
 * Niveau atteint par une mission de placement réussie. Une mission de placement
 * permet de sauter les niveaux inférieurs : réussir une mission de placement de
 * niveau `n` place directement l'élève au niveau `n`. Renvoie `null` si ce n'est
 * pas une mission de placement ou si elle a échoué.
 */
export function placementTargetLevel(
  mission: { isPlacement: boolean; level: number },
  passed: boolean,
): number | null {
  return mission.isPlacement && passed ? mission.level : null;
}
