import { Body, Controller, Post } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { CurrentProfile } from '../../users/current-profile.decorator.js';
import type { Profile } from '../../users/profile.entity.js';
import { PlaceOrderDto } from '../trading/dto/place-order.dto.js';
import { OrderBookService } from './order-book.service.js';

/**
 * Ancienne route `POST /api/trading/orders/market`, conservée pour le
 * formulaire d'ordre au marché déjà livré dans la page M1. Elle ne contourne
 * pas le carnet : elle délègue au même moteur d'appariement, avec la réponse
 * au format précédent (prix moyen, montant total).
 */
@Auth()
@Controller('trading/orders')
export class MarketOrderCompatController {
  constructor(private readonly book: OrderBookService) {}

  @Post('market')
  market(@CurrentProfile() profile: Profile, @Body() dto: PlaceOrderDto) {
    return this.book.placeMarketOrder(profile.id, dto);
  }
}
