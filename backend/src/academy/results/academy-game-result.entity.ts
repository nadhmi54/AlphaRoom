import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Copie normalisée du résultat d'une partie, produite par l'adaptateur de
 * `results/` à partir des données de la Game Room (lecture seule). Unicité sur
 * (roomId, userId) : une partie a plusieurs participants.
 * `score` est le « Score Académie » (score ajusté du risque), qui ne remplace
 * aucun score de la Game Room. `raw` conserve la trace d'origine.
 */
@Entity({ name: 'academy_game_results' })
@Index('idx_academy_game_results_user', ['userId'])
@Index('uq_academy_game_results_room_user', ['roomId', 'userId'], { unique: true })
export class AcademyGameResult {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'room_id', type: 'uuid' }) roomId!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'scenario_id', type: 'varchar', length: 64, nullable: true }) scenarioId!: string | null;
  @Column({ type: 'numeric', precision: 10, scale: 4, nullable: true }) score!: string | null;
  @Column({ name: 'return_percent', type: 'numeric', precision: 18, scale: 4, nullable: true })
  returnPercent!: string | null;
  @Column({ name: 'max_drawdown', type: 'numeric', precision: 10, scale: 6, nullable: true })
  maxDrawdown!: string | null;
  @Column({ type: 'numeric', precision: 18, scale: 6, nullable: true }) sharpe!: string | null;
  @Column({ name: 'orders_count', type: 'int', nullable: true }) ordersCount!: number | null;
  @Column({ name: 'duration_seconds', type: 'int', nullable: true }) durationSeconds!: number | null;
  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` }) raw!: Record<string, unknown>;
  @CreateDateColumn({ name: 'computed_at', type: 'timestamptz' }) computedAt!: Date;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
