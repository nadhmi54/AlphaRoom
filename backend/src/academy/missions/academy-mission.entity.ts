import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Mission (et défi : une mission rattachée à un `scenarioId`). Les critères
 * d'évaluation sont en JSON (drawdown maximal, nombre d'ordres, nombre d'actifs,
 * Sharpe minimal...). `startsAt`/`endsAt` forment une fenêtre de validité
 * optionnelle pour des défis datés. `isPlacement` marque une mission de
 * placement permettant de sauter un niveau.
 */
@Entity({ name: 'academy_missions' })
@Index('idx_academy_missions_scenario', ['scenarioId'])
export class AcademyMission {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 64, unique: true }) code!: string;
  @Column({ type: 'int', default: 1 }) level!: number;
  @Column({ type: 'varchar', length: 160 }) title!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ name: 'scenario_id', type: 'varchar', length: 64, nullable: true }) scenarioId!: string | null;
  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` }) criteria!: Record<string, unknown>;
  @Column({ name: 'is_placement', type: 'boolean', default: false }) isPlacement!: boolean;
  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true }) startsAt!: Date | null;
  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true }) endsAt!: Date | null;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @Column({ type: 'int', default: 0 }) position!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
