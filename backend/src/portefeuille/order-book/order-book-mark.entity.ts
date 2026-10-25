import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Dernier prix exécuté par actif, écrit par le carnet à chaque exécution.
 *
 * M1 s'en sert pour valoriser les positions : sans cette table, le portefeuille
 * resterait évalué au prix de démonstration fixe et le rendement affiché serait
 * faux dès qu'un ordre s'exécute à un autre prix.
 */
@Entity({ name: 'order_book_marks' })
export class OrderBookMark {
  @PrimaryColumn({ type: 'varchar', length: 16 }) symbol!: string;

  @Column({ name: 'last_price', type: 'numeric', precision: 18, scale: 4 })
  lastPrice!: string;

  @Column({ name: 'last_trade_at', type: 'timestamptz' }) lastTradeAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
