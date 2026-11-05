import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { TRADING_ROLES } from '../../users/user-role.enum.js';
import { BinanceRestService } from './binance-rest.service.js';
import { HistoryQueryDto, SearchQueryDto, SpotQueryDto } from './dto/history-query.dto.js';
import { MarketDataService } from './market-data.service.js';
import { findMarketAsset, searchInstruments } from '../trading/market-assets.js';
import { canonicalEngineSymbol } from './market-feed-config.js';

@Auth(...TRADING_ROLES)
@Controller('market')
export class MarketDataController {
  constructor(
    @Inject(MarketDataService) private readonly market: MarketDataService,
    private readonly binanceRest: BinanceRestService,
  ) {}

  /**
   * Prix actuel de chaque actif + mini-courbe. Appelé toutes les secondes.
   * Lecture ouverte à tous les rôles connectés : le Meneur de Jeu en a besoin
   * pour afficher les cotations de référence dans le wizard Game Room.
   */
  @Get('quotes')
  @Auth()
  quotes() {
    return { quotes: this.market.quotes() };
  }

  /**
   * Courbe d'un actif.
   * - Actif connu (XAU/USD, BTC/USD…) : historique depuis la table market_ticks.
   * - Paire Binance arbitraire (ETHUSDT, SOLUSDT…) : klines via l'API REST Binance.
   */
  @Get('history') async history(@Query() query: HistoryQueryDto) {
    // Tout actif du registre moteur (natifs + catalogue + paires Game Room)
    // partage le même historique que `/game-room`.
    const engineSymbol = canonicalEngineSymbol(query.symbol);
    if (engineSymbol) return this.market.history(engineSymbol, query.range);

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
   * Recherche d'actifs dans le marché choisi.
   * - crypto : paires Binance (recherche texte ou suggestions populaires) ;
   * - stock / commodity / forex : catalogue local, filtré par nom ou symbole.
   * Exemples : ?q=ETH&market=crypto ; ?q=Microsoft&market=stock ;
   *            ?q=pétrole&market=commodity ; ?q=GBP&market=forex.
   */
  @Get('search') async search(@Query() query: SearchQueryDto) {
    if (query.market === 'crypto') {
      const hits = query.q.trim()
        ? await this.binanceRest.search(query.q)
        : await this.binanceRest.popular();
      return {
        results: hits.map((item) => {
          // Une paire suivie par le moteur (BTC/USDT, ETH/USDT, SOL/USDT…)
          // renvoie la cotation partagée, pas un prix REST séparé.
          const engine = this.market.quoteFor(item.displaySymbol);
          return {
            ...item,
            symbol: engine?.symbol ?? item.displaySymbol,
            displaySymbol: engine?.symbol ?? item.displaySymbol,
            name: engine?.name ?? item.name,
            price: engine?.price ?? item.price,
            market: 'crypto' as const,
            source: engine?.source ?? ('live' as const),
            changePercent: engine?.changePercent ?? 0,
            engine: Boolean(engine),
            unit: item.displaySymbol.split('/')[0],
          };
        }),
      };
    }

    const results = searchInstruments(query.market, query.q).map((asset) => {
      const engine = this.market.quoteFor(asset.symbol);
      return {
        symbol: asset.symbol,
        displaySymbol: asset.symbol,
        name: asset.name,
        unit: asset.unit,
        price: engine?.price ?? asset.price,
        source: engine?.source ?? asset.source,
        changePercent: engine?.changePercent ?? 0,
        market: asset.category,
        engine: Boolean(engine),
      };
    });
    return { results };
  }

  /**
   * Prix spot d'un actif.
   * - Actif du moteur de prix (natifs + catalogue, provider any) : prix simulé/live
   *   du PriceBook, qui bouge à chaque seconde. Jamais le prix de démo figé.
   * - Paire Binance arbitraire (ETHUSDT, BNB/USDT…) : prix réel via l'API REST.
   */
  @Get('spot') async spot(@Query() query: SpotQueryDto) {
    // 1. L'actif est dans le PriceBook (natif ou catalogue) → prix mouvant.
    const engineQuote = this.market.quoteFor(query.symbol);
    if (engineQuote && engineQuote.price > 0) {
      const asset = findMarketAsset(query.symbol);
      return {
        symbol: engineQuote.symbol,
        displaySymbol: engineQuote.symbol,
        name: asset?.name ?? engineQuote.name,
        unit: asset?.unit ?? engineQuote.unit,
        category: engineQuote.category,
        price: engineQuote.price,
        source: engineQuote.source,
        updatedAt: engineQuote.updatedAt,
        changePercent: engineQuote.changePercent,
        found: true,
      };
    }

    // 2. Paire Binance arbitraire → API REST.
    const safe = query.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const price = await this.binanceRest.getPrice(safe);
    if (price === null) return { symbol: query.symbol, price: null, found: false };
    return {
      symbol: query.symbol,
      displaySymbol: this.binanceRest.toDisplay(safe),
      name: this.binanceRest.toName(safe),
      unit: this.binanceRest.toDisplay(safe).split('/')[0],
      category: 'crypto' as const,
      price,
      source: 'live' as const,
      updatedAt: new Date().toISOString(),
      found: true,
    };
  }
}
