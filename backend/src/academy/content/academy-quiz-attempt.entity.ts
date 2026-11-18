import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Tentative de quiz d'un joueur, enregistrée à chaque soumission corrigée par
 * le serveur. C'est cette table qui matérialise « un cours est validé quand son
 * quiz est réussi » (une tentative réussie sur un quiz du cours) et qui permet
 * d'exclure le dernier quiz tenté lors du tirage aléatoire suivant.
 *
 * `answers` conserve la copie brute envoyée par l'élève (traçabilité), jamais
 * les bonnes réponses. Le score est toujours celui calculé côté serveur.
 */
@Entity({ name: 'academy_quiz_attempts' })
@Index('idx_academy_quiz_attempts_user_course', ['userId', 'courseId', 'createdAt'])
export class AcademyQuizAttempt {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'course_id', type: 'uuid' }) courseId!: string;
  @Column({ name: 'quiz_id', type: 'uuid' }) quizId!: string;
  @Column({ type: 'numeric', precision: 5, scale: 2 }) score!: string;
  @Column({ type: 'boolean', default: false }) passed!: boolean;
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  answers!: Record<string, unknown>[];
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
