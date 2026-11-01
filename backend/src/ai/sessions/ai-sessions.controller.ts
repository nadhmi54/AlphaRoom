import { Controller, Get, Inject } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { CurrentProfile } from '../../users/current-profile.decorator.js';
import type { Profile } from '../../users/profile.entity.js';
import { SESSION_DATA_PROVIDER, type SessionDataProvider } from '../contract/session-data-provider.js';
import { listVisibleSessions } from './session-access.js';

/** Séances proposées dans l'interface IA (enseignant : toutes ; étudiant : les siennes). */
@Controller('ai/sessions')
export class AiSessionsController {
  constructor(@Inject(SESSION_DATA_PROVIDER) private readonly sessions: SessionDataProvider) {}

  @Auth()
  @Get()
  list(@CurrentProfile() profile: Profile) {
    return listVisibleSessions(this.sessions, profile);
  }
}
