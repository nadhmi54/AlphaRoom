import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { TRADING_ROLES } from '../../users/user-role.enum.js';
import { HistoryQueryDto } from './dto/history-query.dto.js';
import { MarketDataService } from './market-data.service.js';

@Auth(...TRADING_ROLES)
@Controller('market')
export class MarketDataController {
  constructor(@Inject(MarketDataService) private readonly market: MarketDataService) {}

  /** Prix actuel de chaque actif + mini-courbe. Appelé toutes les secondes. */
  @Get('quotes') quotes() {
    return { quotes: this.market.quotes() };
  }

  /** Courbe d'un actif sur 5 min, 1 h ou 24 h. */
  @Get('history') history(@Query() query: HistoryQueryDto) {
    return this.market.history(query.symbol, query.range);
  }
}
