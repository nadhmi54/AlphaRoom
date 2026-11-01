import { Body, Controller, Inject, Post } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { CurrentProfile } from '../../users/current-profile.decorator.js';
import type { Profile } from '../../users/profile.entity.js';
import { AskCoachDto } from './ai-coach.dto.js';
import { AiCoachService } from './ai-coach.service.js';

/** Trading Coach : explique la situation de l'étudiant avec ses propres chiffres. */
@Controller('ai/coach')
export class AiCoachController {
  constructor(@Inject(AiCoachService) private readonly service: AiCoachService) {}

  @Auth()
  @Post('ask')
  ask(@CurrentProfile() profile: Profile, @Body() dto: AskCoachDto) {
    return this.service.ask(profile, dto);
  }
}
