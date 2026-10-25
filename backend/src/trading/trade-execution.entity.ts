import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'trade_executions' })
@Index('uq_trade_executions_owner_request', ['ownerId', 'requestId'], {
  unique: true,
})
export class TradeExecution {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'owner_id', type: 'uuid' }) ownerId!: string;

  @Column({ name: 'portfolio_id', type: 'uuid' }) portfolioId!: string;

  @Column({ name: 'request_id', type: 'uuid' }) requestId!: string;

  @Column({ type: 'varchar', length: 16 }) symbol!: string;

  @Column({ type: 'varchar', length: 4 }) side!: 'buy' | 'sell';

  @Column({ type: 'numeric', precision: 18, scale: 6 }) quantity!: string;

  @Column({ type: 'numeric', precision: 18, scale: 4 }) price!: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 }) amount!: string;

  @CreateDateColumn({ name: 'executed_at', type: 'timestamptz' })
  executedAt!: Date;
}
