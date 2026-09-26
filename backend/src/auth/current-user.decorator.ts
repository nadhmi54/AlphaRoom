import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { SupabaseJwtPayload } from './supabase-user.js';

/**
 * Reads the Supabase user decoded by SupabaseJwtGuard.
 * Usage: someRoute(@CurrentUser() user: SupabaseJwtPayload) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SupabaseJwtPayload => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: SupabaseJwtPayload }>();
    return request.user!;
  },
);
