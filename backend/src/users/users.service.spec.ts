import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SupabaseJwtPayload } from '../auth/supabase-user.js';
import { DEFAULT_PREFERENCES, Profile } from './profile.entity.js';
import { UserRole } from './user-role.enum.js';
import { UsersService, escapeLike } from './users.service.js';

function makeProfile(over: Partial<Profile> = {}): Profile {
  return Object.assign(new Profile(), {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'a@alpharoom.test',
    fullName: null,
    username: null,
    avatarUrl: null,
    country: null,
    role: UserRole.TRADER,
    isActive: true,
    preferences: { ...DEFAULT_PREFERENCES },
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });
}

const identity = (over: Partial<SupabaseJwtPayload> = {}): SupabaseJwtPayload => ({
  sub: '11111111-1111-4111-8111-111111111111',
  email: 'a@alpharoom.test',
  role: 'authenticated',
  exp: 0,
  iat: 0,
  ...over,
});

function setup(adminCount = 1) {
  const qb = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getCount: vi.fn().mockResolvedValue(adminCount),
    getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
  };
  const profiles = {
    findOneBy: vi.fn(),
    find: vi.fn().mockResolvedValue([]),
    create: vi.fn((x: Partial<Profile>) => makeProfile(x)),
    save: vi.fn(async (x: Profile) => x),
    createQueryBuilder: vi.fn(() => qb),
  };
  const audit = {
    create: vi.fn((x: unknown) => x),
    save: vi.fn(async (x: unknown) => x),
    findAndCount: vi.fn().mockResolvedValue([[], 0]),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new UsersService(profiles as any, audit as any);
  return { service, profiles, audit, qb };
}

describe('UsersService.getOrCreate', () => {
  it('crée le profil à la première connexion avec le rôle trader', async () => {
    const { service, profiles } = setup();
    profiles.findOneBy.mockResolvedValue(null);
    const p = await service.getOrCreate(
      identity({ user_metadata: { full_name: '  Nadhmi Rouissi ' } }),
    );
    expect(p.role).toBe(UserRole.TRADER);
    expect(p.isActive).toBe(true);
    expect(p.fullName).toBe('Nadhmi Rouissi');
    expect(profiles.save).toHaveBeenCalledOnce();
  });

  it("ne donne jamais le rôle admin d'après le JWT (role / app_metadata)", async () => {
    const { service, profiles } = setup();
    profiles.findOneBy.mockResolvedValue(null);
    const p = await service.getOrCreate(
      identity({ role: 'admin', app_metadata: { role: 'admin' }, user_metadata: { role: 'admin' } }),
    );
    expect(p.role).toBe(UserRole.TRADER);
  });

  it('récupère le profil créé par une requête concurrente (violation 23505)', async () => {
    const { service, profiles } = setup();
    const winner = makeProfile({ fullName: 'Gagnant' });
    profiles.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    profiles.save.mockRejectedValueOnce({ code: '23505' });
    await expect(service.getOrCreate(identity())).resolves.toBe(winner);
  });

  it('ne réécrit pas la base si rien ne change', async () => {
    const { service, profiles } = setup();
    profiles.findOneBy.mockResolvedValue(makeProfile());
    await service.getOrCreate(identity());
    expect(profiles.save).not.toHaveBeenCalled();
  });

  it("synchronise l'e-mail et la dernière connexion quand nécessaire", async () => {
    const { service, profiles } = setup();
    profiles.findOneBy.mockResolvedValue(
      makeProfile({ lastLoginAt: new Date(Date.now() - 3_600_000) }),
    );
    const p = await service.getOrCreate(identity({ email: 'new@alpharoom.test' }));
    expect(p.email).toBe('new@alpharoom.test');
    expect(Date.now() - p.lastLoginAt!.getTime()).toBeLessThan(5_000);
    expect(profiles.save).toHaveBeenCalledOnce();
  });
});

describe('UsersService.updateMe', () => {
  it('fusionne les préférences sans écraser les autres', async () => {
    const { service } = setup();
    const p = await service.updateMe(makeProfile(), {
      fullName: 'Nadhmi',
      preferences: { theme: 'light' },
    });
    expect(p.fullName).toBe('Nadhmi');
    expect(p.preferences).toEqual({ language: 'fr', theme: 'light' });
  });

  it('ne touche pas aux champs absents et peut vider un champ nullable', async () => {
    const { service } = setup();
    const p = await service.updateMe(makeProfile({ username: 'nadhmi', country: 'TN' }), {
      username: null,
    });
    expect(p.username).toBeNull();
    expect(p.country).toBe('TN');
  });

  it('renvoie 409 si le pseudo est déjà pris', async () => {
    const { service, profiles } = setup();
    profiles.save.mockRejectedValueOnce({ driverError: { code: '23505' } });
    await expect(service.updateMe(makeProfile(), { username: 'pris' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('UsersService administration', () => {
  const actor = '99999999-9999-4999-8999-999999999999';
  const targetId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => vi.clearAllMocks());

  it('liste avec filtres et pagination', async () => {
    const { service, qb } = setup();
    await service.list({ search: '50%_x', role: UserRole.TRADER, isActive: false, page: 3, limit: 10 });
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), {
      q: '%50\\%\\_x%',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('p.role = :role', { role: UserRole.TRADER });
    expect(qb.andWhere).toHaveBeenCalledWith('p.is_active = :active', { active: false });
    expect(qb.skip).toHaveBeenCalledWith(20);
    expect(qb.take).toHaveBeenCalledWith(10);
  });

  it('findOne lève 404 si inconnu', async () => {
    const { service, profiles } = setup();
    profiles.findOneBy.mockResolvedValue(null);
    await expect(service.findOne(targetId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('change le rôle et écrit une entrée dans le journal', async () => {
    const { service, profiles, audit } = setup();
    profiles.findOneBy.mockResolvedValue(makeProfile());
    const p = await service.changeRole(actor, targetId, UserRole.GAME_MASTER);
    expect(p.role).toBe(UserRole.GAME_MASTER);
    expect(audit.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: actor,
        targetId,
        action: 'role_changed',
        details: { from: UserRole.TRADER, to: UserRole.GAME_MASTER },
      }),
    );
  });

  it('interdit de modifier son propre rôle ou son propre statut', async () => {
    const { service } = setup();
    await expect(service.changeRole(actor, actor, UserRole.TRADER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.setActive(actor, actor, false)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse de rétrograder ou désactiver le dernier admin actif', async () => {
    const { service, profiles } = setup(0);
    profiles.findOneBy.mockResolvedValue(makeProfile({ role: UserRole.ADMIN }));
    await expect(service.changeRole(actor, targetId, UserRole.TRADER)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.setActive(actor, targetId, false)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("autorise la rétrogradation d'un admin s'il en reste un autre", async () => {
    const { service, profiles } = setup(1);
    profiles.findOneBy.mockResolvedValue(makeProfile({ role: UserRole.ADMIN }));
    const p = await service.changeRole(actor, targetId, UserRole.TRADER);
    expect(p.role).toBe(UserRole.TRADER);
  });

  it('désactive / réactive un compte avec journal, et ignore les no-op', async () => {
    const { service, profiles, audit } = setup();
    profiles.findOneBy.mockResolvedValue(makeProfile());
    await service.setActive(actor, targetId, false);
    expect(audit.save).toHaveBeenCalledWith(expect.objectContaining({ action: 'account_disabled' }));

    audit.save.mockClear();
    profiles.findOneBy.mockResolvedValue(makeProfile({ isActive: true }));
    await service.setActive(actor, targetId, true);
    expect(audit.save).not.toHaveBeenCalled();
  });

  it('pagine le journal et y joint les e-mails', async () => {
    const { service, audit, profiles } = setup();
    audit.findAndCount.mockResolvedValue([
      [{ id: 'l1', actorId: actor, targetId, action: 'role_changed', details: null, createdAt: new Date() }],
      1,
    ]);
    profiles.find.mockResolvedValue([makeProfile({ id: actor, email: 'admin@alpharoom.test' })]);
    const r = await service.listAudit({ page: 2, limit: 5 });
    expect(audit.findAndCount).toHaveBeenCalledWith({
      order: { createdAt: 'DESC' },
      skip: 5,
      take: 5,
    });
    expect(r).toMatchObject({ page: 2, limit: 5, total: 1 });
    expect(r.items[0]).toMatchObject({ actorEmail: 'admin@alpharoom.test', targetEmail: null });
  });
});

describe('escapeLike', () => {
  it('échappe %, _ et \\', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });
});
