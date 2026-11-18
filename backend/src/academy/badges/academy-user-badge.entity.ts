import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Badge obtenu par un joueur (attribué par le moteur de règles). */
@Entity({ name: 'academy_user_badges' })
@Index('idx_academy_user_badges_user', ['userId'])
@Index('uq_academy_user_badges_user_badge', ['userId', 'badgeId'], { unique: true })
export class AcademyUserBadge {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'badge_id', type: 'uuid' }) badgeId!: string;
  @Column({ name: 'rule_id', type: 'uuid', nullable: true }) ruleId!: string | null;
  @CreateDateColumn({ name: 'awarded_at', type: 'timestamptz' }) awardedAt!: Date;
}
