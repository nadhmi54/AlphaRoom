import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type OrderStatus = 'open' | 'partially_filled' | 'filled' | 'cancelled';

/**
 * Un ordre du carnet (marché global par actif).
 *
 * `seq` est la clé de priorité FIFO : elle est générée par Postgres
 * (`generated always as identity`) et jamais écrite par l'application.
 * `ownerId === null` identifie la liquidité système du marché simulé, qui n'a
 * pas de contrepartie comptable.
 */
@Entity({ name: 'orders' })
export class Order {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'bigint', insert: false, update: false }) seq!: string;

  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId!: string | null;

  @Column({ type: 'varchar', length: 16 }) symbol!: string;

  @Column({ type: 'varchar', length: 4 }) side!: OrderSide;

  @Column({ type: 'varchar', length: 6 }) type!: OrderType;

  @Column({ type: 'varchar', length: 20 }) status!: OrderStatus;

  @Column({ type: 'numeric', precision: 18, scale: 6 }) quantity!: string;

  @Column({ name: 'filled_quantity', type: 'numeric', precision: 18, scale: 6 })
  filledQuantity!: string;

  @Column({ name: 'remaining_quantity', type: 'numeric', precision: 18, scale: 6 })
  remainingQuantity!: string;

  @Column({ name: 'limit_price', type: 'numeric', precision: 18, scale: 4, nullable: true })
  limitPrice!: string | null;

  @Column({ name: 'filled_amount', type: 'numeric', precision: 18, scale: 2 })
  filledAmount!: string;

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;
}
