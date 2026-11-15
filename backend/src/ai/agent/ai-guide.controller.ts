import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { CurrentProfile } from '../../users/current-profile.decorator.js';
import type { Profile } from '../../users/profile.entity.js';
import { GuideAlertsQueryDto, GuideTargetDto } from './ai-guide.dto.js';
import { AiGuideService } from './ai-guide.service.js';

/**
 * Guide du trader : alertes pédagogiques en cours de séance, briefing de début,
 * bilan de fin ; et suivi en direct de la classe pour l'enseignant.
 */
@Controller('ai/guide')
export class AiGuideController {
  constructor(@Inject(AiGuideService) private readonly service: AiGuideService) {}

  @Auth()
  @Get('alerts')
  alerts(@CurrentProfile() profile: Profile, @Query() query: GuideAlertsQueryDto) {
    return this.service.alerts(profile, query, query.all === true);
  }

  @Auth()
  @Get('briefing')
  briefing(@CurrentProfile() profile: Profile, @Query() query: GuideTargetDto) {
    return this.service.briefing(profile, query);
  }

  @Auth()
  @Post('debrief')
  debrief(@CurrentProfile() profile: Profile, @Body() body: GuideTargetDto) {
    return this.service.debrief(profile, body);
  }

  @Auth()
  @Get('live')
  live(@CurrentProfile() profile: Profile, @Query() query: GuideTargetDto) {
    return this.service.live(profile, query);
  }
}
