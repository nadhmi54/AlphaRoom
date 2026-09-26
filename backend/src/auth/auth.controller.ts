import { Controller, Get, UseGuards } from '@nestjs/common';
import { SupabaseJwtGuard } from './supabase-jwt.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import type { SupabaseJwtPayload } from './supabase-user.js';

@Controller('auth')
export class AuthController {
  /**
   * Smoke-test route for the auth wiring: proves Angular/React -> Supabase
   * Auth -> NestJS works end to end. Call with
   * "Authorization: Bearer <supabase access_token>".
   */
  @UseGuards(SupabaseJwtGuard)
  @Get('me')
  me(@CurrentUser() user: SupabaseJwtPayload) {
    return {
      id: user.sub,
      email: user.email,
      role: user.role,
    };
  }
}
