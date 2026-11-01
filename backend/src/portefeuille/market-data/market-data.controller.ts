import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { TRADING_ROLES } from '../../users/user-role.enum.js';
import { BinanceRestService } from './binance-rest.service.js';
import { HistoryQueryDto, SearchQueryDto, SpotQueryDto } from './dto/history-query.dto.js';
import { MarketDataService } from './market-data.service.js';
import { findMarketAsset } from '../trading/market-assets.js';

@Auth(...TRADING_ROLES)
@Controller('market')
export class MarketDataController {
  constructor(
    @Inject(MarketDataService) private readonly market: MarketDataService,
    private readonly binanceRest: BinanceRestService,
  ) {}

  /** Prix actuel de chaque actif + mini-courbe. Appelé toutes les secondes. */
  @Get('quotes') quotes() {
    return { quotes: this.market.quotes() };
  }

  /**
   * Courbe d'un actif.
   * - Actif connu (XAU/USD, BTC/USD…) : historique depuis la table market_ticks.
   * - Paire Binance arbitraire (ETHUSDT, SOLUSDT…) : klines via l'API REST Binance.
   */
  @Get('history') async history(@Query() query: HistoryQueryDto) {
    const isKnown = Boolean(findMarketAsset(query.symbol));
    if (isKnown) return this.market.history(query.symbol, query.range);

    // Paire Binance arbitraire : on vérifie que le symbole ressemble à un symbole
    // Binance valide (lettres majuscules uniquement) avant de le transmettre.
    const safe = query.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const klines = await this.binanceRest.getKlines(safe, query.range);
    const first = klines[0]?.price ?? 0;
    const last = klines.at(-1)?.price ?? 0;
    return {
      symbol: query.symbol,
      range: query.range,
      points: klines,
      changePercent: first > 0 ? ((last - first) / first) * 100 : 0,
      source: 'binance-rest' as const,
    };
  }

  /**
   * Recherche de paires Binance dont le nom commence par `q`.
   * Retourne au plus 10 résultats avec prix actuel.
   * Exemples : ?q=ETH → ETHUSDT, ETHBTC… ; ?q=SOL → SOLUSDT…
   */
  @Get('search') async search(@Query() query: SearchQueryDto) {
    const results = await this.binanceRest.search(query.q);
    return { results };
  }

  /**
   * Prix spot en temps réel d'une paire Binance arbitraire.
   * Utilisé pour rafraîchir le prix d'un actif custom sélectionné depuis la recherche.
   */
  @Get('spot') async spot(@Query() query: SpotQueryDto) {
    const safe = query.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const price = await this.binanceRest.getPrice(safe);
    if (price === null) return { symbol: query.symbol, price: null, found: false };
    return {
      symbol: query.symbol,
      displaySymbol: this.binanceRest.toDisplay(safe),
      name: this.binanceRest.toName(safe),
      price,
      source: 'live' as const,
      updatedAt: new Date().toISOString(),
      found: true,
    };
  }
}
