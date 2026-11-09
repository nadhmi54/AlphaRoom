import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AcademyResultsService } from './academy-results.service.js';

/** Intervalle d'ingestion par défaut : une minute. */
export const DEFAULT_INGEST_INTERVAL_MS = 60_000;
/** Intervalle minimal accepté, pour ne pas marteler la base. */
export const MIN_INGEST_INTERVAL_MS = 1_000;

/**
 * Ingestion périodique des résultats de partie. Tâche planifiée NATIVE
 * (`setInterval`), sans dépendance supplémentaire. Le minuteur est arrêté dans
 * `OnModuleDestroy` et ne démarre jamais pendant les tests Vitest.
 *
 * Drapeaux d'environnement :
 *   - `ACADEMY_INGEST_ENABLED`   : `false`/`0` désactive l'ingestion ;
 *   - `ACADEMY_INGEST_INTERVAL_MS` : intervalle en millisecondes.
 */
@Injectable()
export class AcademyIngestScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AcademyIngestScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly results: AcademyResultsService) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log('Ingestion Academy désactivée (drapeau ou mode test).');
      return;
    }
    const interval = this.intervalMs();
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref();
    this.logger.log(`Ingestion Academy active (toutes les ${interval} ms).`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private isEnabled(): boolean {
    const flag = process.env.ACADEMY_INGEST_ENABLED;
    if (flag === 'false' || flag === '0') return false;
    // Les tests ne doivent jamais lancer d'ingestion en arrière-plan.
    return !(process.env.VITEST || process.env.NODE_ENV === 'test');
  }

  private intervalMs(): number {
    const raw = Number(process.env.ACADEMY_INGEST_INTERVAL_MS);
    return Number.isFinite(raw) && raw >= MIN_INGEST_INTERVAL_MS ? raw : DEFAULT_INGEST_INTERVAL_MS;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const ingested = await this.results.ingestFinishedRooms();
      if (ingested > 0) this.logger.log(`${ingested} résultat(s) de partie ingéré(s).`);
    } catch (error) {
      this.logger.error('Échec de l’ingestion des résultats Academy.', error as Error);
    } finally {
      this.running = false;
    }
  }
}
