import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type GameRoomStatus = 'waiting' | 'running' | 'paused' | 'finished';

@Entity({ name: 'game_rooms' })
export class GameRoom {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'varchar', length: 100 }) name!: string;

  /** Code court pour rejoindre la salle (ex. "ABC123"). */
  @Column({ name: 'join_code', type: 'varchar', length: 12 })
  @Index('uq_game_rooms_join_code', { unique: true })
  joinCode!: string;

  @Column({ name: 'master_id', type: 'uuid' }) masterId!: string;

  @Column({ name: 'scenario_id', type: 'varchar', length: 64, default: 'panic_tuesday' })
  scenarioId!: string;

  @Column({ type: 'varchar', length: 20, default: 'waiting' })
  status!: GameRoomStatus;

  /** Instant de simulation courant, en secondes depuis le début du scénario. */
  @Column({ name: 'sim_elapsed_seconds', type: 'int', default: 0 })
  simElapsedSeconds!: number;

  /** Timestamp réel du dernier démarrage (pour calculer le décalage). */
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  /** Timestamp réel de la dernière pause (pour suspendre le compteur). */
  @Column({ name: 'paused_at', type: 'timestamptz', nullable: true })
  pausedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
