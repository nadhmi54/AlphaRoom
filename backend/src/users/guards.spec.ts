import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { ProfileGuard, type AuthenticatedRequest } from './profile.guard.js';
import { Profile } from './profile.entity.js';
import { RolesGuard } from './roles.guard.js';
import { UserRole } from './user-role.enum.js';
import type { UsersService } from './users.service.js';

const ctx = (request: Partial<AuthenticatedRequest>) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

const profile = (over: Partial<Profile> = {}) =>
  Object.assign(new Profile(), { role: UserRole.TRADER, isActive: true }, over);

describe('ProfileGuard', () => {
  const guardFor = (p: Profile) =>
    new ProfileGuard({ getOrCreate: vi.fn().mockResolvedValue(p) } as unknown as UsersService);

  it('attache le profil à la requête', async () => {
    const req = { user: { sub: 'x' } } as unknown as AuthenticatedRequest;
    const p = profile();
    await expect(guardFor(p).canActivate(ctx(req))).resolves.toBe(true);
    expect(req.profile).toBe(p);
  });

  it('bloque un compte désactivé', async () => {
    const req = { user: { sub: 'x' } } as unknown as AuthenticatedRequest;
    await expect(guardFor(profile({ isActive: false })).canActivate(ctx(req))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("refuse si le JWT n'a pas été vérifié avant", async () => {
    await expect(guardFor(profile()).canActivate(ctx({}))).resolves.toBe(false);
  });
});

describe('RolesGuard', () => {
  const guardFor = (required: UserRole[] | undefined) =>
    new RolesGuard({ getAllAndOverride: () => required } as unknown as Reflector);

  it('laisse passer une route sans @Roles', () => {
    expect(guardFor(undefined).canActivate(ctx({ profile: profile() }))).toBe(true);
    expect(guardFor([]).canActivate(ctx({ profile: profile() }))).toBe(true);
  });

  it('autorise un rôle requis, refuse les autres (admin non implicite)', () => {
    const g = guardFor([UserRole.GAME_MASTER]);
    expect(g.canActivate(ctx({ profile: profile({ role: UserRole.GAME_MASTER }) }))).toBe(true);
    expect(() => g.canActivate(ctx({ profile: profile({ role: UserRole.TRADER }) }))).toThrow(
      ForbiddenException,
    );
    expect(() => g.canActivate(ctx({ profile: profile({ role: UserRole.ADMIN }) }))).toThrow(
      ForbiddenException,
    );
  });

  it('refuse sans profil', () => {
    expect(() => guardFor([UserRole.ADMIN]).canActivate(ctx({}))).toThrow(ForbiddenException);
  });
});
