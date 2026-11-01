import { Expose, Type } from 'class-transformer';

/** Indicateurs courants, calculés à la volée depuis l'historique des snapshots. */
export class PerformanceMetricsDto {
  @Expose() portfolioId!: string;

  @Expose()
  asOf!: string;

  @Expose()
  totalValue!: number;

  @Expose()
  observations!: number;

  @Expose()
  dailyReturn!: number | null;

  @Expose() volatilityAnnualized!: number | null;

  @Expose()
  maxDrawdown!: number | null;

  @Expose()
  var95!: number | null;

  @Expose() sharpeRatio!: number | null;

  @Expose()
  insufficientHistory!: string[];
}

/** Une journée de l'historique. */
export class PerformanceSnapshotDto {
  @Expose() date!: string;

  @Expose() totalValue!: number;
  @Expose() dailyReturn!: number | null;
  @Expose() volatilityAnnualized!: number | null;
  @Expose() maxDrawdown!: number | null;
  @Expose() var95!: number | null;
  @Expose() sharpeRatio!: number | null;
}

/** Page d'historique, au format déjà utilisé par `/trading/portfolio`. */
export class PerformanceHistoryDto {
  @Expose()
  @Type(() => PerformanceSnapshotDto)
  items!: PerformanceSnapshotDto[];

  @Expose() page!: number;
  @Expose() pageSize!: number;
  @Expose() total!: number;
  @Expose() pages!: number;
}
