import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PerformanceSnapshotService } from './performance-snapshot.service.js';

/**
 * Sauvegarde quotidienne des performances.
 *
 * Implémentation native sans @nestjs/schedule pour respecter les dépendances existantes.
 * Le job tourne une fois par jour à 1h du matin.
 */
@Injectable()
export class PerformanceSnapshotCron implements OnModuleInit {
  private readonly logger = new Logger(PerformanceSnapshotCron.name);

  constructor(private readonly snapshots: PerformanceSnapshotService) {}

  onModuleInit() {
    this.scheduleNextRun();
  }

  private scheduleNextRun() {
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(1, 0, 0, 0);

    // Si 1h du matin est déjà passée aujourd'hui, on vise demain
    if (now >= nextRun) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const delay = nextRun.getTime() - now.getTime();
    this.logger.log(`Prochain snapshot prévu dans ${Math.round(delay / 1000 / 60)} minutes (à 01:00).`);

    setTimeout(() => {
      this.handleDailySnapshot().then(() => {
        // Une fois le premier run fait, on planifie le suivant dans 24h
        setInterval(() => this.handleDailySnapshot(), 24 * 60 * 60 * 1000);
      });
    }, delay);
  }

  async handleDailySnapshot(): Promise<void> {
    try {
      const { processed, failed } = await this.snapshots.snapshotAll();
      this.logger.log(
        `Snapshots de performance : ${processed} portefeuille(s) enregistré(s), ${failed} en échec.`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Échec du job de snapshots de performance : ${reason}`);
    }
  }
}
