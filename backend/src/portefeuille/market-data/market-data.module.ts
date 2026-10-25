import { Module } from '@nestjs/common';
import { MarketDataController } from './market-data.controller.js';
import { MarketDataService } from './market-data.service.js';

/**
 * Prix en temps réel : flux Binance / Finnhub, repli simulé quand le marché est
 * fermé, historique en base, et recopie du prix dans le carnet d'ordres.
 */
@Module({
  controllers: [MarketDataController],
  providers: [MarketDataService],
  exports: [MarketDataService],
})
export class MarketDataModule {}
