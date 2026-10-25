import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradingModule } from '../trading/trading.module.js';
import { MarketOrderCompatController } from './market-order-compat.controller.js';
import { OrderBookMark } from './order-book-mark.entity.js';
import { OrderBookController } from './order-book.controller.js';
import { OrderBookService } from './order-book.service.js';
import { Order } from './order.entity.js';

/**
 * Moteur du carnet d'ordres : il décide **qui** s'apparie et à quel prix, puis
 * délègue la comptabilisation à `TradingService.applyFill()` (cash, position,
 * historique) dans la même transaction SQL.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderBookMark]), TradingModule],
  controllers: [OrderBookController, MarketOrderCompatController],
  providers: [OrderBookService],
})
export class OrderBookModule {}
