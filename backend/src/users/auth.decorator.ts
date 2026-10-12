import { applyDecorators, UseGuards } from '@nestjs/common';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard.js';
import { ProfileGuard } from './profile.guard.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';
import type { UserRole } from './user-role.enum.js';

/**
 * Décorateur composite pour protéger une route (ou un contrôleur) :
 *   @Auth()                      → utilisateur connecté et actif
 *   @Auth(UserRole.RISK_MANAGER) → + rôle(s) requis (le rôle vient de la base)
 *
 * Ordre d'exécution : JWT Supabase → profil actif → rôle.
 */
export function Auth(...roles: UserRole[]) {
  return applyDecorators(UseGuards(SupabaseJwtGuard, ProfileGuard, RolesGuard), Roles(...roles));
}
