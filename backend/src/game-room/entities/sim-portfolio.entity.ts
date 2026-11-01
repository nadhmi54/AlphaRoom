import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Portefeuille virtuel isolé d'un participant dans une Game Room. */
@Entity({ name: 'sim_portfolios' })
@Index('uq_sim_portfolios_room_user', ['roomId', 'userId'], { unique: true })
export class SimulationPortfolio {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'room_id', type: 'uuid' }) roomId!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: '100000.00' }) cash!: string;
  @Column({ name: 'initial_cash', type: 'numeric', precision: 18, scale: 2, default: '100000.00' })
  initialCash!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
