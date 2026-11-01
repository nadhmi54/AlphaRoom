import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderBookMark } from '../order-book/order-book-mark.entity.js';
import { PriceSource } from '../positions/price-source.js';
import { TradingPortfolio } from '../trading/portfolio.entity.js';
import { TradingPosition } from '../trading/position.entity.js';
import { PerformanceController } from './performance.controller.js';
import { PerformanceMetricsService } from './performance-metrics.service.js';
import { PerformanceService } from './performance.service.js';
import { PerformanceSnapshotCron } from './performance-snapshot.cron.js';
import { PerformanceSnapshot } from './performance-snapshot.entity.js';
import { PerformanceSnapshotService } from './performance-snapshot.service.js';
import { PortfolioValuationService } from './portfolio-valuation.service.js';

/**
 * Module M3 — Performance & risque. Il porte la seule table qui lui appartient
 * (`performance_snapshots`) et lit en lecture seule celles du module
 * portefeuille (`trading_portfolios`, `trading_positions`, `order_book_marks`) :
 * il ne les modifie jamais.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PerformanceSnapshot,
      TradingPortfolio,
      TradingPosition,
      OrderBookMark,
    ]),
  ],
  controllers: [PerformanceController],
  providers: [
    PerformanceMetricsService,
    PortfolioValuationService,
    PerformanceSnapshotService,
    PerformanceService,
    PerformanceSnapshotCron,
    // `PriceSource` appartient au module M2, qui ne l'exporte pas. On le
    // redéclare ici pour appliquer exactement la même règle de prix sans
    // modifier le module existant : la classe est sans état, une seconde
    // instance ne change rien au comportement.
    PriceSource,
  ],
  exports: [PerformanceMetricsService, PerformanceSnapshotService],
})
export class PerformanceModule {}
