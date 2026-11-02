import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Snapshot de l'état complet d'une salle à une minute donnée, pour permettre le Rollback. */
@Entity({ name: 'game_snapshots' })
@Index('idx_game_snapshots_room_time', ['roomId', 'simElapsedSeconds'])
export class GameSnapshot {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'room_id', type: 'uuid' }) roomId!: string;

  @Column({ name: 'sim_elapsed_seconds', type: 'int' })
  simElapsedSeconds!: number;

  /** État sérialisé : prix courant, portefeuilles, positions, ordres actifs. */
  @Column({ type: 'jsonb' }) state!: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
