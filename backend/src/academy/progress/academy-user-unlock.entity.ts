import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Déblocage d'un cours (ou d'un badge) pour un joueur. `source` distingue la
 * progression (mission réussie) de la récompense (victoire / règle).
 */
@Entity({ name: 'academy_user_unlocks' })
@Index('idx_academy_user_unlocks_user', ['userId'])
export class AcademyUserUnlock {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'course_id', type: 'uuid', nullable: true }) courseId!: string | null;
  @Column({ name: 'badge_id', type: 'uuid', nullable: true }) badgeId!: string | null;
  @Column({ type: 'varchar', length: 16 }) source!: 'progression' | 'reward';
  @Column({ name: 'rule_id', type: 'uuid', nullable: true }) ruleId!: string | null;
  @Column({ name: 'room_id', type: 'uuid', nullable: true }) roomId!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
