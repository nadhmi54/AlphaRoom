import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { PriceSource } from '../positions/price-source.js';
import { TradingPortfolio } from '../trading/portfolio.entity.js';
import { TradingPosition } from '../trading/position.entity.js';

export interface PositionValuation {
  symbol: string;
  quantity: number;
  currentPrice: number;
  /** Faux si l'actif n'a pas de cotation : la position est alors valorisée à 0. */
  priceAvailable: boolean;
  marketValue: number;
}

export interface PortfolioValuation {
  portfolioId: string;
  ownerId: string;
  cash: number;
  marketValue: number;
  /** Cash + somme(quantité × prix courant) : la valeur qui alimente les indicateurs. */
  totalValue: number;
  positions: PositionValuation[];
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Valeur de marché d'un portefeuille : `cash + Σ(quantité × prix courant)`.
 *
 * Lecture seule : ce service ne crée ni ne modifie jamais de portefeuille
 * (contrairement au module de trading, qui en crée un à la première visite).
 * Il réutilise les tables du module portefeuille et `PriceSource`, la même
 * source de prix que l'écran Positions — les deux écrans affichent donc
 * exactement les mêmes montants.
 */
@Injectable()
export class PortfolioValuationService {
  constructor(
    @InjectRepository(TradingPortfolio)
    private readonly portfolios: Repository<TradingPortfolio>,
    @InjectRepository(TradingPosition)
    private readonly positions: Repository<TradingPosition>,
    @Inject(PriceSource) private readonly prices: PriceSource,
  ) {}

  /** Tous les portefeuilles existants (sert au job quotidien). */
  findAllPortfolios(): Promise<TradingPortfolio[]> {
    return this.portfolios.find({ order: { createdAt: 'ASC' } });
  }

  /** Valorise un portefeuille, ou `null` s'il n'existe pas. */
  async valuateByPortfolioId(portfolioId: string): Promise<PortfolioValuation | null> {
    const portfolio = await this.portfolios.findOne({ where: { id: portfolioId } });
    return portfolio ? this.valuate(portfolio) : null;
  }

  /** Valorise le portefeuille d'un utilisateur, ou `null` s'il n'en a pas. */
  async valuateByOwnerId(ownerId: string): Promise<PortfolioValuation | null> {
    const portfolio = await this.portfolios.findOne({ where: { ownerId } });
    return portfolio ? this.valuate(portfolio) : null;
  }

  async valuate(portfolio: TradingPortfolio): Promise<PortfolioValuation> {
    const [prices, rows] = await Promise.all([
      this.prices.getPrices(),
      this.positions.find({ where: { portfolioId: portfolio.id }, order: { symbol: 'ASC' } }),
    ]);

    const positions: PositionValuation[] = rows
      .filter((row) => Number(row.quantity) > 0)
      .map((row) => {
        const quantity = Number(row.quantity);
        const currentPrice = prices.get(row.symbol);
        return {
          symbol: row.symbol,
          quantity,
          currentPrice: currentPrice ?? 0,
          priceAvailable: currentPrice !== undefined,
          marketValue: roundMoney(quantity * (currentPrice ?? 0)),
        };
      });

    const cash = Number(portfolio.cash);
    const marketValue = roundMoney(positions.reduce((sum, item) => sum + item.marketValue, 0));

    return {
      portfolioId: portfolio.id,
      ownerId: portfolio.ownerId,
      cash,
      marketValue,
      totalValue: roundMoney(cash + marketValue),
      positions,
    };
  }
}
