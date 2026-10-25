import { Controller, Get, Post, Query } from '@nestjs/common';
import { Auth } from '../users/auth.decorator.js';
import { CurrentProfile } from '../users/current-profile.decorator.js';
import type { Profile } from '../users/profile.entity.js';
import { PortfolioHistoryQueryDto } from './dto/portfolio-history-query.dto.js';
import { TradingService } from './trading.service.js';

// Les ordres sont passés par le carnet d'ordres : voir
// `order-book/order-book.controller.ts` (`POST /api/orders`) et
// `order-book/market-order-compat.controller.ts` pour l'ancienne route
// `POST /api/trading/orders/market`.
@Auth()
@Controller('trading')
export class TradingController {
  constructor(private readonly trading: TradingService) {}

  @Get('assets') assets() {
    return this.trading.getAssets();
  }

  @Get('quote') quote(@Query('symbol') symbol?: string) {
    return this.trading.getQuote(symbol);
  }

  @Get('portfolio') portfolio(
    @CurrentProfile() profile: Profile,
    @Query() query: PortfolioHistoryQueryDto,
  ) {
    return this.trading.getPortfolio(profile.id, query);
  }

  @Post('portfolio/reset')
  reset(@CurrentProfile() profile: Profile) {
    return this.trading.resetPortfolio(profile.id);
  }
}
