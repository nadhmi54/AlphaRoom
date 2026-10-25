import { IsIn, IsNumber, IsString, IsUUID, Max, Min, ValidateIf } from 'class-validator';
import { MARKET_ASSETS } from '../../trading/market-assets.js';

const SYMBOLS = MARKET_ASSETS.map((asset) => asset.symbol);

/**
 * Ordre envoyé au carnet.
 *
 * `type: 'market'` consomme le carnet et annule le reliquat.
 * `type: 'limit'` s'exécute si le prix croise, sinon il reste en attente ;
 * `limitPrice` est alors obligatoire.
 */
export class PlaceBookOrderDto {
  @IsString()
  @IsIn(SYMBOLS)
  symbol!: string;

  @IsString()
  @IsIn(['buy', 'sell'])
  side!: 'buy' | 'sell';

  @IsString()
  @IsIn(['market', 'limit'])
  type!: 'market' | 'limit';

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(1000000)
  quantity!: number;

  @ValidateIf((dto: PlaceBookOrderDto) => dto.type === 'limit')
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(10000000)
  limitPrice?: number;

  @IsUUID()
  requestId!: string;
}
