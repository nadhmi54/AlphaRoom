import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import type { Repository } from 'typeorm';
import {
  PerformanceHistoryDto,
  PerformanceMetricsDto,
} from './dto/performance-response.dto.js';
import type { PerformanceHistoryQueryDto } from './dto/performance-history-query.dto.js';
import { PerformanceSnapshotService } from './performance-snapshot.service.js';
import { TradingPortfolio } from '../trading/portfolio.entity.js';

/**
 * Point d'entrée des routes de performance : il vérifie que le portefeuille
 * demandé appartient bien à l'utilisateur du JWT avant de rendre le moindre
 * chiffre — sans ce contrôle, l'identifiant passé dans l'URL suffirait à lire
 * le portefeuille d'un autre.
 */
@Injectable()
export class PerformanceService {
  constructor(
    @InjectRepository(TradingPortfolio)
    private readonly portfolios: Repository<TradingPortfolio>,
    private readonly snapshots: PerformanceSnapshotService,
  ) {}

  /** Indicateurs courants, calculés à la volée (aucune écriture en base). */
  async getCurrent(portfolioId: string, ownerId: string): Promise<PerformanceMetricsDto> {
    const portfolio = await this.requireOwnedPortfolio(portfolioId, ownerId);
    const metrics = await this.snapshots.getMetrics(portfolio);
    return plainToInstance(PerformanceMetricsDto, {
      portfolioId: portfolio.id,
      ...metrics,
    });
  }

  /** Historique quotidien des snapshots, du plus récent au plus ancien. */
  async getHistory(
    portfolioId: string,
    ownerId: string,
    query: PerformanceHistoryQueryDto,
  ): Promise<PerformanceHistoryDto> {
    const portfolio = await this.requireOwnedPortfolio(portfolioId, ownerId);
    const history = await this.snapshots.getHistory(portfolio.id, query);
    return plainToInstance(PerformanceHistoryDto, history);
  }

  private async requireOwnedPortfolio(
    portfolioId: string,
    ownerId: string,
  ): Promise<TradingPortfolio> {
    const portfolio = await this.portfolios.findOne({ where: { id: portfolioId } });
    if (!portfolio) throw new NotFoundException('Portefeuille introuvable.');
    if (portfolio.ownerId !== ownerId) {
      throw new ForbiddenException('Ce portefeuille appartient à un autre utilisateur.');
    }
    return portfolio;
  }
}
