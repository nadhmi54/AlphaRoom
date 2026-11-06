import { Module } from '@nestjs/common';
import { BinanceRestService } from './binance-rest.service.js';

/**
 * Accès REST public Binance, partagé par le module de données de marché et par
 * le carnet d'ordres (prix de référence des paires découvertes à la volée).
 * Isolé dans son propre module pour éviter une dépendance circulaire entre
 * `MarketDataModule` et `OrderBookModule`.
 */
@Module({
  providers: [BinanceRestService],
  exports: [BinanceRestService],
})
export class BinanceRestModule {}
