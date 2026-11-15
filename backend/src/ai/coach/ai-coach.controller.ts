import { Body, Controller, Inject, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
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

  /**
   * Même chose que `ask`, mais la réponse s'écrit en direct (server-sent events) :
   * `tool` (outil consulté), `delta` (morceau de texte), `reset` (le coach se corrige),
   * `done` (réponse complète et métadonnées) ou `error`.
   */
  @Auth()
  @Post('stream')
  async stream(@CurrentProfile() profile: Profile, @Body() dto: AskCoachDto, @Res() res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    let closed = false;
    res.on('close', () => {
      closed = true;
    });
    await this.service.stream(profile, dto, (event) => {
      if (!closed) res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    if (!closed) res.end();
  }
}
