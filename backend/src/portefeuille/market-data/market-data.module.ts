import { Module } from '@nestjs/common';
import { OrderBookModule } from '../order-book/order-book.module.js';
import { BinanceRestService } from './binance-rest.service.js';
import { MarketDataController } from './market-data.controller.js';
import { MarketDataService } from './market-data.service.js';

/**
 * Prix en temps réel : flux Binance / Finnhub, repli simulé quand le marché est
 * fermé, historique en base, et recopie du prix dans le carnet d'ordres.
 * BinanceRestService : accès REST public pour la recherche et les actifs custom.
 */
@Module({
  imports: [OrderBookModule],
  controllers: [MarketDataController],
  providers: [MarketDataService, BinanceRestService],
  exports: [MarketDataService],
})
export class MarketDataModule {}
