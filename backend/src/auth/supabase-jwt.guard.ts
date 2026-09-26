import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import type { SupabaseJwtPayload } from './supabase-user.js';

/**
 * Framework-level identity check: verifies the Supabase-issued JWT sent by
 * the frontend (Authorization: Bearer <token>) — see the Supabase guide,
 * section 4 ("Angular envoie le token à NestJS. NestJS vérifie l'identité").
 *
 * This only checks the token's signature/expiry (authentication). Business
 * authorization rules (can this user do this action) belong in whichever
 * domain module uses @CurrentUser(), not here.
 *
 * Note: assumes the Supabase project's JWT secret is a shared HMAC secret
 * (HS256, the default). A project switched to asymmetric signing keys
 * (ES256/RS256) needs JWKS-based verification instead.
 */
@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token manquant');
    }

    try {
      const secret = this.config.get<string>('SUPABASE_JWT_SECRET')!;
      const payload = jwt.verify(token, secret) as SupabaseJwtPayload;
      (request as Request & { user?: SupabaseJwtPayload }).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token invalide ou expiré');
    }
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length).trim();
  }
}
