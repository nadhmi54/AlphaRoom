import { Module } from '@nestjs/common';
import { OrderBookModule } from '../order-book/order-book.module.js';
import { MarketDataController } from './market-data.controller.js';
import { MarketDataService } from './market-data.service.js';

/**
 * Prix en temps réel : flux Binance / Finnhub, repli simulé quand le marché est
 * fermé, historique en base, et recopie du prix dans le carnet d'ordres.
 */
@Module({
  imports: [OrderBookModule],
  controllers: [MarketDataController],
  providers: [MarketDataService],
  exports: [MarketDataService],
})
export class MarketDataModule {}
