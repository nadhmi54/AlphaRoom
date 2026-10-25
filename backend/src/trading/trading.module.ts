import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradingController } from './trading.controller.js';
import { OrderBookMark } from '../order-book/order-book-mark.entity.js';
import { Order } from '../order-book/order.entity.js';
import { TradingPortfolio } from './portfolio.entity.js';
import { TradingPosition } from './position.entity.js';
import { TradeExecution } from './trade-execution.entity.js';
import { TradingService } from './trading.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TradingPortfolio,
      TradingPosition,
      TradeExecution,
      Order,
      OrderBookMark,
    ]),
  ],
  controllers: [TradingController],
  providers: [TradingService],
  // Le carnet d'ordres appelle `applyFill()` : c'est le seul chemin
  // d'écriture des exécutions (cash, positions, historique).
  exports: [TradingService],
})
export class TradingModule {}
