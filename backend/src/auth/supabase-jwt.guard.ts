import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
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
 * Supabase signs tokens in one of two ways, and both are supported:
 *  - HS256 with a shared secret (SUPABASE_JWT_SECRET): legacy projects;
 *  - ES256 / RS256 with asymmetric signing keys: the default on recent
 *    projects and on recent versions of the local CLI. The public keys are
 *    fetched (and cached) from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
 * The accepted algorithms are pinned per branch, so a token can never pick
 * its own verification method.
 */
@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseJwtGuard.name);
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token manquant');
    }

    try {
      const payload = await this.verify(token);
      (request as Request & { user?: SupabaseJwtPayload }).user = payload;
      return true;
    } catch (error) {
      // La raison exacte reste côté serveur ; le client reçoit un message générique.
      this.logger.warn(`JWT rejeté : ${error instanceof Error ? error.message : String(error)}`);
      throw new UnauthorizedException('Token invalide ou expiré');
    }
  }

  private async verify(token: string): Promise<SupabaseJwtPayload> {
    const { alg } = decodeProtectedHeader(token);

    if (alg === 'HS256') {
      const secret = this.config.get<string>('SUPABASE_JWT_SECRET');
      if (!secret) {
        throw new Error(
          'SUPABASE_JWT_SECRET est requis pour vérifier les jetons HS256.',
        );
      }
      return jwt.verify(token, secret, { algorithms: ['HS256'] }) as SupabaseJwtPayload;
    }

    const { payload } = await jwtVerify(token, this.getJwks(), {
      algorithms: ['ES256', 'RS256'],
    });
    return payload as unknown as SupabaseJwtPayload;
  }

  private getJwks() {
    if (!this.jwks) {
      const base = this.config.get<string>('SUPABASE_URL');
      if (!base) {
        throw new Error('SUPABASE_URL manquant : impossible de récupérer les clés publiques (JWKS).');
      }
      this.jwks = createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', base));
    }
    return this.jwks;
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length).trim();
  }
}
