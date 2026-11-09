import { Body, Controller, NotFoundException, Post } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { CurrentProfile } from '../../users/current-profile.decorator.js';
import type { Profile } from '../../users/profile.entity.js';
import { AcademyRulesService } from '../rules/academy-rules.service.js';
import type { AcademyReward } from '../rules/academy-events.js';
import { AcademyResultsService } from './academy-results.service.js';
import { SimulationEventDto } from './dto/simulation-event.dto.js';

/**
 * Endpoints de SIMULATION, actifs uniquement hors production (drapeau
 * `ACADEMY_SIMULATION_ENABLED`, et jamais en `NODE_ENV=production`). Ils
 * permettent de tester tout le parcours — événement, règles, récompenses,
 * ingestion — sans dépendre d'une Game Room réelle.
 */
@Auth()
@Controller('academy/simulation')
export class AcademySimulationController {
  constructor(
    private readonly rules: AcademyRulesService,
    private readonly results: AcademyResultsService,
  ) {}

  /** Injecte un événement interne et renvoie les récompenses accordées. */
  @Post('events')
  inject(
    @CurrentProfile() profile: Profile,
    @Body() dto: SimulationEventDto,
  ): Promise<AcademyReward[]> {
    this.assertEnabled();
    return this.rules.processEvent({
      type: dto.type,
      userId: dto.userId ?? profile.id,
      roomId: dto.roomId ?? null,
      missionId: dto.missionId ?? null,
      scenarioId: dto.scenarioId ?? null,
      metrics: dto.metrics ?? null,
      payload: dto.payload ?? {},
    });
  }

  /** Force l'ingestion des parties terminées, sans attendre le minuteur. */
  @Post('ingest')
  async ingest(): Promise<{ ingested: number }> {
    this.assertEnabled();
    return { ingested: await this.results.ingestFinishedRooms() };
  }

  private assertEnabled(): void {
    const disabled =
      process.env.NODE_ENV === 'production' || process.env.ACADEMY_SIMULATION_ENABLED === 'false';
    if (disabled) throw new NotFoundException('Simulation désactivée.');
  }
}
