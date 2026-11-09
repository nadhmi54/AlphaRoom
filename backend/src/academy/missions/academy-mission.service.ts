import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import type { Repository } from 'typeorm';
import { AcademyMission } from './academy-mission.entity.js';
import { AcademyAccessService, type PlayerAccess } from '../path/academy-access.service.js';
import { missionUnlockCondition, type MissionState } from '../path/path-logic.js';
import { MissionDto } from './dto/mission.dto.js';
import { isMissionOpen } from './mission-criteria.js';

/**
 * Catalogue des missions et défis. L'évaluation des critères vit dans
 * `mission-criteria.ts` (fonctions pures) et l'avancement par niveau dans
 * `AcademyAccessService` : ce service ne fait que lire les missions et exposer,
 * pour chacune, ses critères, sa fenêtre de validité et son état dans le
 * parcours du joueur (verrouillée, disponible ou réussie).
 *
 * `open` (fenêtre de dates) reste distinct de `state` (progression) : une
 * mission peut être « ouverte » dans le temps mais encore verrouillée tant que
 * les cours de son niveau ne sont pas tous validés.
 */
@Injectable()
export class AcademyMissionService {
  constructor(
    @InjectRepository(AcademyMission)
    private readonly missions: Repository<AcademyMission>,
    private readonly access: AcademyAccessService,
  ) {}

  /** Missions du joueur, triées par niveau, avec leur état de parcours. */
  async listMissions(userId: string, now: Date = new Date()): Promise<MissionDto[]> {
    const [missions, access] = await Promise.all([
      this.missions.find({ order: { level: 'ASC', position: 'ASC', title: 'ASC' } }),
      this.access.getAccess(userId),
    ]);
    return missions.map((mission) => this.toDto(mission, now, this.stateFor(mission, access)));
  }

  /** Détail d'une mission, avec son état pour le joueur. */
  async getMission(id: string, userId: string, now: Date = new Date()): Promise<MissionDto> {
    const mission = await this.missions.findOne({ where: { id } });
    if (!mission) throw new NotFoundException('Mission introuvable.');
    const access = await this.access.getAccess(userId);
    return this.toDto(mission, now, this.stateFor(mission, access));
  }

  /**
   * État d'une mission dans le parcours : on retrouve d'abord la mission par
   * son identifiant, puis par son niveau (utile si elle n'est pas active et donc
   * absente du calcul d'accès). À défaut, elle est considérée verrouillée.
   */
  private stateFor(mission: AcademyMission, access: PlayerAccess): MissionState {
    const byId = access.levels.find((level) => level.mission?.id === mission.id);
    const byLevel = access.levels.find((level) => level.level === mission.level);
    return (byId ?? byLevel)?.mission?.state ?? 'locked';
  }

  private toDto(mission: AcademyMission, now: Date, state: MissionState): MissionDto {
    return plainToInstance(MissionDto, {
      id: mission.id,
      code: mission.code,
      level: mission.level,
      title: mission.title,
      description: mission.description,
      scenarioId: mission.scenarioId,
      criteria: mission.criteria,
      isPlacement: mission.isPlacement,
      startsAt: mission.startsAt,
      endsAt: mission.endsAt,
      open: isMissionOpen(mission, now),
      state,
      unlockCondition: missionUnlockCondition(state, mission.level),
    });
  }
}
