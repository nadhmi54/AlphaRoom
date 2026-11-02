import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SimOrderSide = 'buy' | 'sell';
export type SimOrderType = 'market' | 'limit';
export type SimOrderStatus = 'open' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected';

@Entity({ name: 'sim_orders' })
@Index('idx_sim_orders_room', ['roomId', 'createdAt'])
@Index('idx_sim_orders_portfolio', ['portfolioId', 'createdAt'])
export class SimulationOrder {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'room_id', type: 'uuid' }) roomId!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'portfolio_id', type: 'uuid' }) portfolioId!: string;

  @Column({ type: 'varchar', length: 16, default: 'XAU/USD' }) symbol!: string;
  @Column({ type: 'varchar', length: 10 }) side!: SimOrderSide;
  @Column({ type: 'varchar', length: 10 }) type!: SimOrderType;

  @Column({ type: 'numeric', precision: 18, scale: 6 }) quantity!: string;
  @Column({ name: 'limit_price', type: 'numeric', precision: 18, scale: 4, nullable: true })
  limitPrice!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'open' }) status!: SimOrderStatus;

  @Column({ name: 'filled_quantity', type: 'numeric', precision: 18, scale: 6, default: '0' })
  filledQuantity!: string;

  @Column({ name: 'remaining_quantity', type: 'numeric', precision: 18, scale: 6 })
  remainingQuantity!: string;

  @Column({ name: 'average_price', type: 'numeric', precision: 18, scale: 4, nullable: true })
  averagePrice!: string | null;

  @Column({ name: 'stop_loss', type: 'numeric', precision: 18, scale: 4, nullable: true })
  stopLoss!: string | null;

  @Column({ name: 'take_profit', type: 'numeric', precision: 18, scale: 4, nullable: true })
  takeProfit!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
