import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'sim_trades' })
@Index('idx_sim_trades_room', ['roomId', 'executedAt'])
@Index('idx_sim_trades_portfolio', ['portfolioId', 'executedAt'])
export class SimulationTrade {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'room_id', type: 'uuid' }) roomId!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'portfolio_id', type: 'uuid' }) portfolioId!: string;
  @Column({ name: 'order_id', type: 'uuid', nullable: true }) orderId!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'XAU/USD' }) symbol!: string;
  @Column({ type: 'varchar', length: 10 }) side!: 'buy' | 'sell';

  @Column({ type: 'numeric', precision: 18, scale: 6 }) quantity!: string;
  @Column({ type: 'numeric', precision: 18, scale: 4 }) price!: string;
  @Column({ type: 'numeric', precision: 18, scale: 2 }) amount!: string;

  @Column({ name: 'sim_minute', type: 'numeric', precision: 6, scale: 2, default: 0 })
  simMinute!: number;

  @CreateDateColumn({ name: 'executed_at', type: 'timestamptz' }) executedAt!: Date;
}
