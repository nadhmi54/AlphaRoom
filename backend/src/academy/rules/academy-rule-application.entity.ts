import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Journal d'application d'une règle : garantit l'idempotence (une règle ne
 * s'applique qu'une fois par partie et par joueur). L'unicité réelle est portée
 * par l'index SQL `uq_academy_rule_applications_scope` (règle + joueur +
 * COALESCE(room_id, uuid nil)). `reward` trace ce qui a été accordé.
 */
@Entity({ name: 'academy_rule_applications' })
@Index('idx_academy_rule_applications_user', ['userId'])
export class AcademyRuleApplication {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'rule_id', type: 'uuid' }) ruleId!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'room_id', type: 'uuid', nullable: true }) roomId!: string | null;
  @Column({ name: 'result_id', type: 'uuid', nullable: true }) resultId!: string | null;
  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` }) reward!: Record<string, unknown>;
  @Column({ name: 'xp_awarded', type: 'int', default: 0 }) xpAwarded!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
