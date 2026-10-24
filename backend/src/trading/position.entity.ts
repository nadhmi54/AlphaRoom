import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'trading_positions' })
@Index('uq_trading_positions_portfolio_symbol', ['portfolioId', 'symbol'], {
  unique: true,
})
export class TradingPosition {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'portfolio_id', type: 'uuid' }) portfolioId!: string;

  @Column({ type: 'varchar', length: 16 }) symbol!: string;

  @Column({ type: 'numeric', precision: 18, scale: 6, default: '0' })
  quantity!: string;

  @Column({
    name: 'average_price',
    type: 'numeric',
    precision: 18,
    scale: 4,
    default: '0',
  })
  averagePrice!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
