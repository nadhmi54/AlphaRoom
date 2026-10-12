import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './profile.guard.js';
import type { Profile } from './profile.entity.js';

/** Profil applicatif chargé par ProfileGuard (route protégée par @Auth()). */
export const CurrentProfile = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Profile =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().profile!,
);
