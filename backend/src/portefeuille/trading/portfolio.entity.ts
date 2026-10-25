import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'trading_portfolios' })
@Index('uq_trading_portfolios_owner', ['ownerId'], { unique: true })
export class TradingPortfolio {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'owner_id', type: 'uuid' }) ownerId!: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: '100000.00' })
  cash!: string;

  @Column({
    name: 'initial_cash',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: '100000.00',
  })
  initialCash!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
