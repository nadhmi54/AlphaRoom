import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Une ligne par exécution, et non par ordre : un ordre au marché de 15 oz qui
 * rencontre 8 oz à 2 001 $ et 7 oz à 2 002 $ produit **deux** lignes, une par
 * contrepartie. `orderId` les rattache à l'ordre qui les a générées.
 *
 * L'idempotence (`requestId`) est portée par `orders (owner_id, request_id)` :
 * la contrainte unique d'origine sur `(owner_id, request_id)` empêchait les
 * exécutions partielles et a été retirée par `20261025140000_order_book.sql`.
 */
@Entity({ name: 'trade_executions' })
export class TradeExecution {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'owner_id', type: 'uuid' }) ownerId!: string;

  @Column({ name: 'portfolio_id', type: 'uuid' }) portfolioId!: string;

  @Column({ name: 'request_id', type: 'uuid' }) requestId!: string;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId!: string | null;

  @Column({ type: 'varchar', length: 16 }) symbol!: string;

  @Column({ type: 'varchar', length: 4 }) side!: 'buy' | 'sell';

  @Column({ type: 'numeric', precision: 18, scale: 6 }) quantity!: string;

  @Column({ type: 'numeric', precision: 18, scale: 4 }) price!: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 }) amount!: string;

  @CreateDateColumn({ name: 'executed_at', type: 'timestamptz' })
  executedAt!: Date;
}
