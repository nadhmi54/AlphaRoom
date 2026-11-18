import { Controller, Get } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { CurrentProfile } from '../../users/current-profile.decorator.js';
import type { Profile } from '../../users/profile.entity.js';
import { AcademyBadgeService } from './academy-badge.service.js';
import type { BadgeDto, UserBadgeDto } from './dto/badge.dto.js';

/**
 * Badges de l'Academy. Le catalogue est consultable par toute personne
 * connectée (pour afficher les objectifs) ; les badges obtenus sont toujours
 * ceux du profil du JWT — aucun identifiant n'est accepté en entrée.
 */
@Auth()
@Controller('academy')
export class AcademyBadgeController {
  constructor(private readonly badges: AcademyBadgeService) {}

  @Get('badges')
  catalog(): Promise<BadgeDto[]> {
    return this.badges.listBadges();
  }

  @Get('badges/me')
  mine(@CurrentProfile() profile: Profile): Promise<UserBadgeDto[]> {
    return this.badges.getMyBadges(profile.id);
  }
}
