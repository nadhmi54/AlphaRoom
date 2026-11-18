/**
 * Règles pures du parcours par niveau de l'Academy : tirage d'un quiz de cours,
 * nom du badge de niveau et calcul du niveau courant. Isolées ici pour être
 * vérifiables sans base : ni réseau, ni horloge implicite.
 */

/**
 * Tire un quiz au hasard parmi ceux d'un cours, en excluant le dernier quiz
 * tenté s'il en existe d'autres. Un seul quiz disponible est renvoyé tel quel
 * (on ne peut pas l'exclure). Le hasard est injectable (`rng`) pour être testé.
 *
 * Renvoie `null` si le cours n'a aucun quiz.
 */
export function pickQuiz(
  quizIds: readonly string[],
  lastQuizId: string | null,
  rng: () => number = Math.random,
): string | null {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of quizIds) {
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(id);
    }
  }
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];

  const pool = lastQuizId ? unique.filter((id) => id !== lastQuizId) : unique;
  const candidates = pool.length > 0 ? pool : unique;
  const rawIndex = Math.floor(rng() * candidates.length);
  const index = Math.min(candidates.length - 1, Math.max(0, rawIndex));
  return candidates[index];
}

/**
 * Code du badge de niveau. Le palier 1 réutilise le badge « Débutant » déjà
 * présent au catalogue ; les niveaux suivants suivent le même format `NIVEAU_n`.
 */
export function levelBadgeCode(level: number): string {
  return level === 1 ? 'DEBUTANT' : `NIVEAU_${level}`;
}

/**
 * Niveau courant du joueur : `1` est toujours ouvert, et chaque mission réussie
 * des niveaux consécutifs à partir de 1 ouvre le suivant. On s'arrête au premier
 * niveau dont la mission n'est pas réussie.
 */
export function computeCurrentLevel(passedLevels: ReadonlySet<number>): number {
  let level = 1;
  while (passedLevels.has(level)) level += 1;
  return level;
}

/**
 * Un contenu de niveau `n` est ouvert si le joueur a atteint ce niveau. Un
 * niveau absent (`undefined`) est traité comme le niveau 1 : le contenu sans
 * palier explicite reste accessible.
 */
export function isLevelOpen(level: number, currentLevel: number): boolean {
  const safeLevel = Number.isFinite(level) ? level : 1;
  return safeLevel <= currentLevel;
}

/** État d'une mission dans le parcours, du point de vue du joueur. */
export type MissionState = 'locked' | 'available' | 'passed';

/**
 * Condition de déblocage affichée pour une mission selon son état et son
 * niveau. Centralisée ici pour que toutes les vues (parcours, missions) disent
 * exactement la même chose.
 */
export function missionUnlockCondition(state: MissionState, level: number): string {
  switch (state) {
    case 'locked':
      return `Valide tous les cours du niveau ${level} pour débloquer cette mission.`;
    case 'available':
      return 'Mission disponible : réussis ses critères lors d’une partie.';
    default:
      return 'Mission réussie : le niveau suivant est ouvert.';
  }
}
