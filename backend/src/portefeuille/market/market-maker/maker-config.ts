import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MarketMakerConfig {
  spreadBps: number;
  volatility: number;
  inventory: number;
  maxInventory: number;
}

@Injectable()
export class MakerConfigProvider {
  constructor(private readonly config: ConfigService) {}

  getConfig(): MarketMakerConfig {
    return {
      spreadBps: this.config.get<number>('MARKET_MAKER_SPREAD_BPS', 10),
      volatility: this.config.get<number>('MARKET_MAKER_VOLATILITY', 0.2),
      inventory: this.config.get<number>('MARKET_MAKER_INVENTORY', 0),
      maxInventory: this.config.get<number>('MARKET_MAKER_MAX_INVENTORY', 1000),
    };
  }
}
