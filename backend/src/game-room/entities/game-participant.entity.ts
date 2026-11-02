import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'game_participants' })
@Index('uq_game_participants_room_user', ['roomId', 'userId'], { unique: true })
export class GameParticipant {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'room_id', type: 'uuid' }) roomId!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;

  /** Pseudo affiché dans la salle (email tronqué par défaut). */
  @Column({ type: 'varchar', length: 80 }) nickname!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;

  @CreateDateColumn({ name: 'joined_at', type: 'timestamptz' }) joinedAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
