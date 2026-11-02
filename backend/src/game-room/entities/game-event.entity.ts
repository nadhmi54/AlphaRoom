import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type GameEventType =
  | 'PRICE_SHOCK'
  | 'VOLATILITY_SHOCK'
  | 'SPREAD_SHOCK'
  | 'LIQUIDITY_SHOCK'
  | 'NEWS'
  | 'WHALE'
  | 'PAUSE'
  | 'RESUME'
  | 'ROLLBACK';

@Entity({ name: 'game_events' })
@Index('idx_game_events_room', ['roomId', 'simElapsedSeconds'])
export class GameEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'room_id', type: 'uuid' }) roomId!: string;

  @Column({ type: 'varchar', length: 30 }) type!: GameEventType;

  @Column({ type: 'varchar', length: 255 }) title!: string;

  @Column({ type: 'text', nullable: true }) description!: string | null;

  @Column({ type: 'jsonb', default: {} }) payload!: Record<string, any>;

  /** Minute simulée au moment où l'événement se produit (ex: 11.0 pour min 11). */
  @Column({ name: 'sim_elapsed_seconds', type: 'int', default: 0 })
  simElapsedSeconds!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
