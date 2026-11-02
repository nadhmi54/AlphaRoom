import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { SseTokenValidator } from './sse-token.js';
import { ProfileGuard } from '../../../users/profile.guard.js';

@Injectable()
export class QuotesGuard implements CanActivate {
  constructor(
    private readonly validator: SseTokenValidator,
    private readonly profileGuard: ProfileGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.query.token;

    if (!token) {
      throw new UnauthorizedException('Token manquant pour le flux SSE');
    }

    try {
      const payload = await this.validator.validate(token);
      request.user = payload;
      
      // On délègue au ProfileGuard existant pour charger le profil et vérifier s'il est actif
      return await this.profileGuard.canActivate(context);
    } catch {
      throw new UnauthorizedException('Accès SSE refusé');
    }
  }
}
