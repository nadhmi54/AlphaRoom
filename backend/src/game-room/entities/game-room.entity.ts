import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { MarketSourceConfig, RoomAssets } from '../game-room-config.js';

export type GameRoomStatus = 'waiting' | 'running' | 'paused' | 'finished';

export type GameRoomSourceMode = 'scenario' | 'synthetic' | 'historical' | 'csv' | 'live';

@Entity({ name: 'game_rooms' })
export class GameRoom {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'varchar', length: 100 }) name!: string;

  @Column({ type: 'text', nullable: true }) description!: string | null;

  /** Code court pour rejoindre la salle (ex. "ABC123"). */
  @Column({ name: 'join_code', type: 'varchar', length: 12 })
  @Index('uq_game_rooms_join_code', { unique: true })
  joinCode!: string;

  @Column({ name: 'master_id', type: 'uuid' }) masterId!: string;

  @Column({ name: 'scenario_id', type: 'varchar', length: 64, default: 'panic_tuesday' })
  scenarioId!: string;

  @Column({ type: 'varchar', length: 20, default: 'waiting' })
  status!: GameRoomStatus;

  /** Actifs négociables dans la salle ; le premier est l'actif principal. */
  @Column({ type: 'jsonb', default: () => `'["XAU/USD"]'::jsonb` })
  assets!: RoomAssets;

  @Column({ name: 'max_participants', type: 'int', default: 30 })
  maxParticipants!: number;

  @Column({ name: 'initial_capital', type: 'numeric', precision: 18, scale: 2, default: 100000 })
  initialCapital!: string;

  @Column({ type: 'varchar', length: 8, default: 'USD' }) currency!: string;

  /** Multiplicateur appliqué au spread naturel de la source de prix. */
  @Column({ name: 'spread_multiplier', type: 'numeric', precision: 8, scale: 4, default: 1 })
  spreadMultiplier!: string;

  /** Commission prélevée sur le montant nominal de chaque exécution, en %. */
  @Column({ name: 'commission_percent', type: 'numeric', precision: 8, scale: 4, default: 0 })
  commissionPercent!: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 1 }) leverage!: string;

  @Column({ name: 'allow_short_selling', type: 'boolean', default: false })
  allowShortSelling!: boolean;

  /** Exposition maximale par participant, en devise de la salle (null = illimitée). */
  @Column({ name: 'max_exposure', type: 'numeric', precision: 18, scale: 2, nullable: true })
  maxExposure!: string | null;

  /** Perte maximale tolérée sur une position, en % du capital initial (null = désactivée). */
  @Column({ name: 'risk_limit_percent', type: 'numeric', precision: 5, scale: 2, nullable: true })
  riskLimitPercent!: string | null;

  @Column({ name: 'source_mode', type: 'varchar', length: 16, default: 'scenario' })
  sourceMode!: GameRoomSourceMode;

  /** Paramètres propres à la source choisie (prix initial, volatilité, bougies CSV…). */
  @Column({ name: 'source_config', type: 'jsonb', default: () => `'{}'::jsonb` })
  sourceConfig!: MarketSourceConfig;

  /** Durée réelle de la séance, en minutes. */
  @Column({ name: 'duration_minutes', type: 'int', default: 30 }) durationMinutes!: number;

  /** Granularité des bougies affichées : 1m, 5m, 15m, 30m, 1h. */
  @Column({ type: 'varchar', length: 5, default: '1m' }) timeframe!: string;

  /** Secondes de simulation écoulées par seconde réelle. */
  @Column({ name: 'playback_speed', type: 'numeric', precision: 10, scale: 4, default: 1 })
  playbackSpeed!: string;

  /** Durée totale de la simulation en secondes de simulation. */
  @Column({ name: 'total_sim_seconds', type: 'int', default: 1800 }) totalSimSeconds!: number;

  /** Fenêtre historique rejouée (modes historical / csv). */
  @Column({ name: 'history_start_at', type: 'timestamptz', nullable: true })
  historyStartAt!: Date | null;

  @Column({ name: 'history_end_at', type: 'timestamptz', nullable: true })
  historyEndAt!: Date | null;

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
