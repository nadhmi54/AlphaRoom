import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module.js';
import { MarketMakerController } from './market-maker/market-maker.controller.js';
import { MarketMakerService } from './market-maker/market-maker.service.js';
import { MakerConfigProvider } from './market-maker/maker-config.js';
import { QuotesController } from './quotes/quotes.controller.js';
import { QuotesService } from './quotes/quotes.service.js';
import { SseTokenValidator } from './quotes/sse-token.js';
import { QuotesGuard } from './quotes/quotes.guard.js';
import { MarketTransactionsController } from './transactions/market-transactions.controller.js';
import { MarketTransactionsService } from './transactions/market-transactions.service.js';

@Module({
  imports: [MarketDataModule],
  controllers: [
    MarketMakerController,
    QuotesController,
    MarketTransactionsController,
  ],
  providers: [
    MarketMakerService,
    MakerConfigProvider,
    QuotesService,
    SseTokenValidator,
    QuotesGuard,
    MarketTransactionsService,
  ],
  exports: [MarketMakerService, MarketTransactionsService],
})
export class MarketModule {}
