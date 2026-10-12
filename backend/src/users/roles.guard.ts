import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './profile.guard.js';
import { ROLES_KEY } from './roles.decorator.js';
import type { UserRole } from './user-role.enum.js';

/** Vérifie `@Roles(...)` contre le rôle stocké en base (jamais celui du JWT). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const profile = context.switchToHttp().getRequest<AuthenticatedRequest>().profile;
    if (!profile || !required.includes(profile.role)) {
      throw new ForbiddenException('Accès refusé : droits insuffisants.');
    }
    return true;
  }
}
