import type { MissionMetrics } from '../missions/mission-criteria.js';

/**
 * Événements internes de l'Academy. Le reste du module ne dépend QUE de ce
 * contrat : l'adaptateur de `results/` produit « partie terminée », les autres
 * briques produisent « quiz réussi » / « défi gagné » / « série de jours ». Le
 * moteur de règles n'appelle jamais directement la Game Room.
 */
export type AcademyEventType = 'game_finished' | 'quiz_passed' | 'challenge_won' | 'streak_days';

/**
 * Événement interne traité par le moteur de règles. `metrics` porte les
 * indicateurs de la partie ou du défi (rendement, Sharpe, drawdown, ordres,
 * durée, actifs) : ils viennent toujours du serveur, jamais du navigateur.
 */
export interface AcademyEvent {
  type: AcademyEventType;
  userId: string;
  roomId?: string | null;
  resultId?: string | null;
  missionId?: string | null;
  scenarioId?: string | null;
  metrics?: MissionMetrics | null;
  /** Données propres au type d'événement (jours de série, identifiant de quiz...). */
  payload?: Record<string, unknown>;
  occurredAt?: Date;
}

/** Résultat d'une règle appliquée : ce qui a été accordé (traçable et testable). */
export interface AcademyReward {
  ruleId: string;
  ruleCode: string;
  rewardType: 'course' | 'badge' | 'xp' | 'course_choice';
  /** `granted` : accordé tel quel ; `converted_to_xp` : remplacé par de l'XP ; `pending_choice` : choix non construit. */
  status: 'granted' | 'converted_to_xp' | 'pending_choice';
  /** Score Académie calculé pour l'événement (0 à 100). */
  score: number;
  /** XP réellement accordé (0 si la récompense n'est pas de l'XP). */
  xp: number;
  courseId?: string | null;
  badgeId?: string | null;
  badgeCode?: string | null;
  note?: string;
}
