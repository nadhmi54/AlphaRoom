import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { PerformanceHistoryQueryDto } from './dto/performance-history-query.dto.js';
import { PerformanceMetricsService } from './performance-metrics.service.js';
import { PerformanceSnapshot } from './performance-snapshot.entity.js';
import { PortfolioValuationService } from './portfolio-valuation.service.js';
import type { TradingPortfolio } from '../trading/portfolio.entity.js';

/** Indicateurs d'une journée, tels qu'exposés par l'API. */
export interface SnapshotMetrics {
  asOf: string;
  totalValue: number;
  observations: number;
  dailyReturn: number | null;
  volatilityAnnualized: number | null;
  maxDrawdown: number | null;
  var95: number | null;
  sharpeRatio: number | null;
  insufficientHistory: string[];
}

/** Un chiffre est arrondi à 6 décimales avant écriture (colonne `numeric(18,8)`). */
function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e6) / 1e6;
}

function decimal(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Construit et relit l'historique quotidien des performances.
 *
 * Toute la série vient de la table `performance_snapshots` : c'est la seule
 * source de vérité pour un calcul dans le temps. Une valeur passée recalculée
 * aujourd'hui avec les prix du jour serait fausse, on ne la reconstruit donc
 * jamais depuis les exécutions.
 */
@Injectable()
export class PerformanceSnapshotService {
  private readonly logger = new Logger(PerformanceSnapshotService.name);

  constructor(
    @InjectRepository(PerformanceSnapshot)
    private readonly snapshots: Repository<PerformanceSnapshot>,
    private readonly valuation: PortfolioValuationService,
    private readonly metrics: PerformanceMetricsService,
  ) {}

  /**
   * Indicateurs **actuels**, sans rien écrire : la série est celle des
   * snapshots enregistrés, complétée par la valorisation du jour (la ligne du
   * jour est remplacée par une valeur fraîche pour ne pas afficher un chiffre
   * figé depuis le passage du job).
   */
  async getMetrics(portfolio: TradingPortfolio): Promise<SnapshotMetrics> {
    const series = await this.buildSeries(portfolio);
    return this.computeMetrics(series.values, series.asOf, series.totalValue);
  }

  /** Historique paginé, du plus récent au plus ancien. */
  async getHistory(portfolioId: string, query: PerformanceHistoryQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(365, Math.max(1, Number(query.limit) || 30));
    const [rows, total] = await this.snapshots.findAndCount({
      where: { portfolioId },
      order: { date: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      items: rows.map((row) => ({
        date: row.date,
        totalValue: Number(row.totalValue),
        dailyReturn: decimal(row.dailyReturn),
        volatilityAnnualized: decimal(row.volatilityAnnualized),
        maxDrawdown: decimal(row.maxDrawdown),
        var95: decimal(row.var95),
        sharpeRatio: decimal(row.sharpeRatio),
      })),
      page,
      pageSize,
      total,
      pages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Écrit (ou met à jour) le snapshot du jour pour un portefeuille.
   * La contrainte unique `(portfolio_id, date)` garantit qu'un second passage
   * le même jour met à jour la ligne au lieu d'en créer une deuxième.
   */
  async createSnapshot(portfolio: TradingPortfolio): Promise<PerformanceSnapshot> {
    const series = await this.buildSeries(portfolio);
    const computed = this.computeMetrics(series.values, series.asOf, series.totalValue);

    const existing = await this.snapshots.findOne({
      where: { portfolioId: portfolio.id, date: series.asOf },
    });
    const snapshot = existing ?? this.snapshots.create({
      portfolioId: portfolio.id,
      date: series.asOf,
    });

    snapshot.totalValue = series.totalValue.toFixed(2);
    snapshot.dailyReturn = this.toColumn(computed.dailyReturn);
    snapshot.volatilityAnnualized = this.toColumn(computed.volatilityAnnualized);
    snapshot.maxDrawdown = this.toColumn(computed.maxDrawdown);
    snapshot.var95 = this.toColumn(computed.var95);
    snapshot.sharpeRatio = this.toColumn(computed.sharpeRatio);

    return this.snapshots.save(snapshot);
  }

  /** Un snapshot par portefeuille existant ; un échec isolé n'arrête pas le lot. */
  async snapshotAll(): Promise<{ processed: number; failed: number }> {
    const portfolios = await this.valuation.findAllPortfolios();
    let processed = 0;
    let failed = 0;

    for (const portfolio of portfolios) {
      try {
        await this.createSnapshot(portfolio);
        processed += 1;
      } catch (error) {
        failed += 1;
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Snapshot ignoré pour le portefeuille ${portfolio.id} : ${reason}`);
      }
    }

    return { processed, failed };
  }

  /**
   * Série de valeurs à utiliser : l'historique enregistré (hors jour courant)
   * suivi de la valorisation du moment. Le point du jour est ainsi toujours à
   * jour, que le snapshot ait déjà été écrit ou non.
   */
  private async buildSeries(portfolio: TradingPortfolio) {
    const asOf = today();
    const history = await this.snapshots.find({
      where: { portfolioId: portfolio.id },
      order: { date: 'ASC' },
    });
    const valuation = await this.valuation.valuate(portfolio);

    const values = history
      .filter((row) => row.date !== asOf)
      .map((row) => Number(row.totalValue));
    values.push(valuation.totalValue);

    return { asOf, values, totalValue: valuation.totalValue };
  }

  private computeMetrics(values: number[], asOf: string, totalValue: number): SnapshotMetrics {
    const returns = this.metrics.computeDailyReturns(values);
    const insufficientHistory: string[] = [];

    const dailyReturn = returns.length >= 1 ? round(returns[returns.length - 1]) : null;
    if (dailyReturn === null) insufficientHistory.push('dailyReturn');

    const volatilityAnnualized =
      returns.length >= 2 ? round(this.metrics.computeVolatility(returns)) : null;
    if (volatilityAnnualized === null) insufficientHistory.push('volatilityAnnualized');

    const maxDrawdown =
      values.length >= 2 ? round(this.metrics.computeMaxDrawdown(values)) : null;
    if (maxDrawdown === null) insufficientHistory.push('maxDrawdown');

    const var95 = returns.length >= 1 ? round(this.metrics.computeVaR(returns)) : null;
    if (var95 === null) insufficientHistory.push('var95');

    const sharpeRatio =
      returns.length >= 2 ? round(this.metrics.computeSharpeRatio(returns)) : null;
    if (sharpeRatio === null) insufficientHistory.push('sharpeRatio');

    return {
      asOf,
      totalValue,
      observations: values.length,
      dailyReturn,
      volatilityAnnualized,
      maxDrawdown,
      var95,
      sharpeRatio,
      insufficientHistory,
    };
  }

  private toColumn(value: number | null): string | null {
    return value === null ? null : value.toFixed(8);
  }
}
