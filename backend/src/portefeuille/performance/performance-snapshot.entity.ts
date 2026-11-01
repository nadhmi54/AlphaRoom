import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Photographie quotidienne des performances d'un portefeuille.
 *
 * Un seul enregistrement par portefeuille et par jour (contrainte
 * `uq_performance_snapshots_portfolio_date`) : le job quotidien met à jour la
 * ligne du jour au lieu d'en empiler une nouvelle à chaque passage.
 *
 * `totalValue` est la valeur de marché du portefeuille (cash + positions) au
 * moment du calcul : c'est la série qui alimente le rendement, la volatilité,
 * le drawdown, la VaR et le ratio de Sharpe. Les indicateurs qui ont besoin
 * d'au moins deux points d'historique restent `null` tant qu'ils ne peuvent
 * pas être calculés — on n'écrit jamais un chiffre inventé.
 */
@Entity({ name: 'performance_snapshots' })
@Index('uq_performance_snapshots_portfolio_date', ['portfolioId', 'date'], { unique: true })
export class PerformanceSnapshot {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'portfolio_id', type: 'uuid' }) portfolioId!: string;

  /** Jour de la mesure, au format `YYYY-MM-DD` (une ligne par portefeuille et par jour). */
  @Column({ type: 'date' }) date!: string;

  @Column({ name: 'total_value', type: 'numeric', precision: 18, scale: 2 })
  totalValue!: string;

  /** Variation de la valeur par rapport au snapshot précédent (0.01 = +1 %). */
  @Column({ name: 'daily_return', type: 'numeric', precision: 18, scale: 8, nullable: true })
  dailyReturn!: string | null;

  /** Volatilité annualisée des rendements journaliers. */
  @Column({
    name: 'volatility_annualized',
    type: 'numeric',
    precision: 18,
    scale: 8,
    nullable: true,
  })
  volatilityAnnualized!: string | null;

  /** Pire baisse depuis un point haut, en fraction positive (0.25 = -25 %). */
  @Column({ name: 'max_drawdown', type: 'numeric', precision: 18, scale: 8, nullable: true })
  maxDrawdown!: string | null;

  /** VaR historique à 95 %, exprimée en perte positive. */
  @Column({ name: 'var95', type: 'numeric', precision: 18, scale: 8, nullable: true })
  var95!: string | null;

  /** Ratio de Sharpe annualisé (taux sans risque annualisé fourni en entrée). */
  @Column({ name: 'sharpe_ratio', type: 'numeric', precision: 18, scale: 8, nullable: true })
  sharpeRatio!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
