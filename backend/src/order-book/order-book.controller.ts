import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Auth } from '../users/auth.decorator.js';
import { CurrentProfile } from '../users/current-profile.decorator.js';
import type { Profile } from '../users/profile.entity.js';
import { BookQueryDto } from './dto/book-query.dto.js';
import { OrdersQueryDto } from './dto/orders-query.dto.js';
import { PlaceBookOrderDto } from './dto/place-book-order.dto.js';
import { OrderBookService } from './order-book.service.js';

/**
 * API du carnet d'ordres (M1). Le carnet est global par actif : tout le monde
 * s'apparie contre le même carnet, sans auto-appariement.
 */
@Auth()
@Controller('orders')
export class OrderBookController {
  constructor(private readonly book: OrderBookService) {}

  /** Photo du carnet : bids (verts), asks (rouges), spread. */
  @Get('book')
  snapshot(@Query() query: BookQueryDto) {
    return this.book.getBook(query.symbol, query.depth ?? 12);
  }

  /** Ordres du compte connecté, les plus récents d'abord. */
  @Get()
  list(@CurrentProfile() profile: Profile, @Query() query: OrdersQueryDto) {
    return this.book.listOrders(profile.id, query.status);
  }

  /** Passe un ordre au marché ou limite. */
  @Post()
  place(@CurrentProfile() profile: Profile, @Body() dto: PlaceBookOrderDto) {
    return this.book.placeOrder(profile.id, dto);
  }

  /** Annule un ordre encore en attente. */
  @Delete(':id')
  cancel(
    @CurrentProfile() profile: Profile,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.book.cancelOrder(profile.id, id);
  }
}
