import { Injectable, Logger } from '@nestjs/common';
import { MakerConfigProvider } from './maker-config.js';
import { QuoteCalculator, type Quote } from './quote-calculator.js';

@Injectable()
export class MarketMakerService {
  private readonly logger = new Logger(MarketMakerService.name);
  private isRunning = false;
  private currentInventory = 0; // En mémoire pour ce module

  constructor(private readonly configProvider: MakerConfigProvider) {
    this.currentInventory = this.configProvider.getConfig().inventory;
  }

  start() {
    this.isRunning = true;
    this.logger.log('Bot teneur de marché démarré');
  }

  stop() {
    this.isRunning = false;
    this.logger.log('Bot teneur de marché arrêté');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      config: this.configProvider.getConfig(),
      currentInventory: this.currentInventory,
    };
  }

  calculateQuote(referencePrice: number): Quote | null {
    if (!this.isRunning) return null;

    const config = this.configProvider.getConfig();
    return QuoteCalculator.calculate(
      referencePrice,
      config.spreadBps,
      config.volatility,
      this.currentInventory,
      config.maxInventory,
    );
  }

  /** Met à jour l'inventaire simulé (appelé lors des exécutions si branché) */
  updateInventory(delta: number) {
    this.currentInventory += delta;
  }
}
