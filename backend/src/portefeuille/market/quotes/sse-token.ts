import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, createRemoteJWKSet, decodeProtectedHeader } from 'jose';
import jwt from 'jsonwebtoken';

@Injectable()
export class SseTokenValidator {
  private readonly logger = new Logger(SseTokenValidator.name);
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: ConfigService) {}

  async validate(token: string): Promise<any> {
    try {
      const { alg } = decodeProtectedHeader(token);

      if (alg === 'HS256') {
        const secret = this.config.get<string>('SUPABASE_JWT_SECRET');
        if (!secret) throw new Error('SUPABASE_JWT_SECRET manquant');
        return jwt.verify(token, secret, { algorithms: ['HS256'] });
      }

      const { payload } = await jwtVerify(token, this.getJwks(), {
        algorithms: ['ES256', 'RS256'],
      });
      return payload;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Validation token SSE échouée: ${reason}`);
      throw error;
    }
  }

  private getJwks() {
    if (!this.jwks) {
      const base = this.config.get<string>('SUPABASE_URL');
      if (!base) throw new Error('SUPABASE_URL manquant');
      this.jwks = createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', base));
    }
    return this.jwks;
  }
}
