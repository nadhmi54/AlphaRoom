import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ListUsersQueryDto } from './dto/admin.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

const check = async <T extends object>(cls: new () => T, plain: object) => {
  const dto = plainToInstance(cls, plain);
  return { dto, errors: await validate(dto, { whitelist: true, forbidNonWhitelisted: false }) };
};

describe('UpdateProfileDto', () => {
  it('accepte un profil valide et normalise les valeurs', async () => {
    const { dto, errors } = await check(UpdateProfileDto, {
      fullName: '  Nadhmi Rouissi ',
      username: ' Nadhmi_R ',
      country: 'tn',
      avatarUrl: 'https://exemple.com/a.png',
      preferences: { theme: 'light' },
    });
    expect(errors).toHaveLength(0);
    expect(dto.fullName).toBe('Nadhmi Rouissi');
    expect(dto.username).toBe('nadhmi_r');
    expect(dto.country).toBe('TN');
  });

  it.each([
    ['pseudo trop court', { username: 'ab' }],
    ['pseudo avec espaces', { username: 'a b c' }],
    ['URL non https', { avatarUrl: 'http://exemple.com/a.png' }],
    ['pays invalide', { country: 'TUN' }],
    ['thème inconnu', { preferences: { theme: 'neon' } }],
  ])('rejette %s', async (_label, plain) => {
    const { errors } = await check(UpdateProfileDto, plain);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('ignore (whitelist) un champ role injecté', async () => {
    const { dto } = await check(UpdateProfileDto, { role: 'admin', fullName: 'Ab' });
    expect((dto as unknown as Record<string, unknown>)['role']).toBeUndefined();
  });
});

describe('ListUsersQueryDto', () => {
  it('convertit isActive et la pagination depuis la query string', async () => {
    const { dto, errors } = await check(ListUsersQueryDto, {
      isActive: 'false',
      page: '2',
      limit: '50',
      role: 'trader',
    });
    expect(errors).toHaveLength(0);
    expect(dto.isActive).toBe(false);
    expect(dto.page).toBe(2);
  });

  it('rejette un rôle inconnu et une limite trop grande', async () => {
    expect((await check(ListUsersQueryDto, { role: 'root' })).errors.length).toBeGreaterThan(0);
    expect((await check(ListUsersQueryDto, { limit: '1000' })).errors.length).toBeGreaterThan(0);
  });
});
