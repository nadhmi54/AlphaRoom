import { Body, Controller, Inject, Post } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { CurrentProfile } from '../../users/current-profile.decorator.js';
import type { Profile } from '../../users/profile.entity.js';
import { UserRole } from '../../users/user-role.enum.js';
import { MarketAnalysisDto, ReplayAnalysisDto } from './ai-analysis.dto.js';
import { AiAnalysisService } from './ai-analysis.service.js';

/** Analyses réservées à l'enseignant : marché (Market Analyst) et replay (Replay Analyzer). */
@Controller('ai/analysis')
export class AiAnalysisController {
  constructor(@Inject(AiAnalysisService) private readonly service: AiAnalysisService) {}

  @Auth(UserRole.GAME_MASTER, UserRole.ADMIN)
  @Post('market')
  market(@CurrentProfile() profile: Profile, @Body() dto: MarketAnalysisDto) {
    return this.service.market(profile, dto);
  }

  @Auth(UserRole.GAME_MASTER, UserRole.ADMIN)
  @Post('replay')
  replay(@CurrentProfile() profile: Profile, @Body() dto: ReplayAnalysisDto) {
    return this.service.replay(profile, dto);
  }
}
