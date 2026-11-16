import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RunSnapshot } from '../run-snapshot.js';

/**
 * Passage archivé d'une salle, écrit juste avant un rollback (le rollback
 * supprime les exécutions et ordres postérieurs). Permet de comparer
 * « avant » et « après » dans le module IA.
 */
@Entity({ name: 'game_run_archives' })
@Index('uq_game_run_archives_room_run', ['roomId', 'run'], { unique: true })
export class GameRunArchive {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'room_id', type: 'uuid' }) roomId!: string;

  @Column({ type: 'int' }) run!: number;

  @Column({ type: 'jsonb' }) snapshot!: RunSnapshot;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
