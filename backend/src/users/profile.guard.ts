import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { SupabaseJwtPayload } from '../auth/supabase-user.js';
import type { Profile } from './profile.entity.js';
import { UsersService } from './users.service.js';

export type AuthenticatedRequest = Request & { user?: SupabaseJwtPayload; profile?: Profile };

/**
 * À exécuter après SupabaseJwtGuard : charge (ou crée) le profil applicatif,
 * refuse les comptes désactivés et expose `request.profile`.
 */
@Injectable()
export class ProfileGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) return false;

    const profile = await this.users.getOrCreate(request.user);
    if (!profile.isActive) {
      throw new ForbiddenException('Ce compte a été désactivé.');
    }
    request.profile = profile;
    return true;
  }
}
