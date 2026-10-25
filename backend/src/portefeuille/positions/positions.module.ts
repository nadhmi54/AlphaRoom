import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderBookMark } from '../order-book/order-book-mark.entity.js';
import { TradingPortfolio } from '../trading/portfolio.entity.js';
import { TradingPosition } from '../trading/position.entity.js';
import { TradeExecution } from '../trading/trade-execution.entity.js';
import { PositionsController } from './positions.controller.js';
import { PositionsService } from './positions.service.js';
import { PriceSource } from './price-source.js';

/**
 * Module M2 — Positions & répartition. Il ne possède aucune table : il lit
 * celles du module de trading et ne les modifie jamais.
 */
@Module({
  imports: [TypeOrmModule.forFeature([
      TradingPortfolio,
      TradingPosition,
      TradeExecution,
      OrderBookMark,
    ])],
  controllers: [PositionsController],
  providers: [PositionsService, PriceSource],
  exports: [PositionsService],
})
export class PositionsModule {}
