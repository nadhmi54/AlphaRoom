import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { CurrentProfile } from '../../users/current-profile.decorator.js';
import type { Profile } from '../../users/profile.entity.js';
import { AcademyMissionService } from './academy-mission.service.js';
import type { MissionDto } from './dto/mission.dto.js';

/**
 * Missions et défis de l'Academy. Lecture ouverte à toute personne connectée :
 * les critères sont visibles pour que l'élève connaisse l'objectif. L'état
 * (verrouillée / disponible / réussie) est calculé pour le profil du JWT —
 * aucun identifiant n'est accepté en entrée.
 */
@Auth()
@Controller('academy')
export class AcademyMissionController {
  constructor(private readonly missions: AcademyMissionService) {}

  @Get('missions')
  list(@CurrentProfile() profile: Profile): Promise<MissionDto[]> {
    return this.missions.listMissions(profile.id);
  }

  @Get('missions/:id')
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentProfile() profile: Profile,
  ): Promise<MissionDto> {
    return this.missions.getMission(id, profile.id);
  }
}
