import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { OrderBookMark } from '../order-book/order-book-mark.entity.js';
import { MARKET_ASSETS } from '../trading/market-assets.js';

/**
 * Source unique des prix actuels utilisée par le module M2.
 *
 * Elle applique la même règle que la valorisation du module trading,
 * pour que les deux écrans affichent les mêmes chiffres : le **dernier prix
 * exécuté dans le carnet d'ordres** quand il existe, sinon le prix de
 * démonstration de l'actif. Si les prix simulés changent un jour,
 * seule cette classe change.
 */
@Injectable()
export class PriceSource {
  constructor(
    @InjectRepository(OrderBookMark)
    private readonly marks: Repository<OrderBookMark>,
  ) {}

  /** Prix actuel de chaque actif connu, indexé par symbole. */
  async getPrices(): Promise<Map<string, number>> {
    const prices = new Map<string, number>(
      MARKET_ASSETS.map((asset) => [asset.symbol, asset.price]),
    );
    for (const mark of await this.marks.find()) {
      prices.set(mark.symbol, Number(mark.lastPrice));
    }
    return prices;
  }
}
