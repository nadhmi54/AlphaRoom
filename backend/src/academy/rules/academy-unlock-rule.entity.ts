import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Règle de déblocage : relie un événement (partie terminée, quiz réussi, défi
 * gagné, série de jours) à une récompense (cours avancé, badge, XP).
 * `conditions` porte les seuils (score ajusté du risque, minimum d'ordres et de
 * durée, drawdown maximal...). `choiceOptions` réserve la récompense « au choix
 * parmi 2-3 cours » sans la construire.
 */
@Entity({ name: 'academy_unlock_rules' })
@Index('idx_academy_unlock_rules_trigger', ['triggerEvent', 'isActive'])
export class AcademyUnlockRule {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 64, unique: true }) code!: string;
  @Column({ name: 'trigger_event', type: 'varchar', length: 32 })
  triggerEvent!: 'game_finished' | 'quiz_passed' | 'challenge_won' | 'streak_days';
  @Column({ name: 'mission_id', type: 'uuid', nullable: true }) missionId!: string | null;
  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` }) conditions!: Record<string, unknown>;
  @Column({ name: 'reward_type', type: 'varchar', length: 16 })
  rewardType!: 'course' | 'badge' | 'xp' | 'course_choice';
  @Column({ name: 'reward_course_id', type: 'uuid', nullable: true }) rewardCourseId!: string | null;
  @Column({ name: 'reward_badge_id', type: 'uuid', nullable: true }) rewardBadgeId!: string | null;
  @Column({ name: 'xp_amount', type: 'int', default: 0 }) xpAmount!: number;
  @Column({ name: 'choice_options', type: 'jsonb', nullable: true }) choiceOptions!: unknown[] | null;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @Column({ type: 'int', default: 0 }) priority!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
