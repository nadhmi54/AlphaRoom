import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Auth } from '../users/auth.decorator.js';
import { CurrentProfile } from '../users/current-profile.decorator.js';
import type { Profile } from '../users/profile.entity.js';
import { PlaceOrderDto } from './dto/place-order.dto.js';
import { PortfolioHistoryQueryDto } from './dto/portfolio-history-query.dto.js';
import { TradingService } from './trading.service.js';

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

  @Post('orders/market') order(
    @CurrentProfile() profile: Profile,
    @Body() dto: PlaceOrderDto,
  ) {
    return this.trading.placeOrder(profile.id, dto);
  }
}
