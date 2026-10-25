import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradingController } from './trading.controller.js';
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
    ]),
  ],
  controllers: [TradingController],
  providers: [TradingService],
})
export class TradingModule {}
