import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AcademyCourse } from '../content/academy-course.entity.js';
import { AcademyMission } from '../missions/academy-mission.entity.js';
import { AcademyPack } from '../rewards/academy-pack.entity.js';
import { AcademyPackItem } from '../rewards/academy-pack-item.entity.js';
import { AcademyUnlockRule } from '../rules/academy-unlock-rule.entity.js';
import { AcademyBadge } from '../badges/academy-badge.entity.js';
import { AcademyAdminService } from './academy-admin.service.js';

function repoFor<T extends object>(Entity: new () => T) {
  return {
    create: vi.fn((input: Partial<T>) => Object.assign(new Entity(), input)),
    save: vi.fn((entity: T) => Promise.resolve(entity)),
    findOne: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

function setup() {
  const courses = repoFor(AcademyCourse);
  const packs = repoFor(AcademyPack);
  const packItems = repoFor(AcademyPackItem);
  const rules = repoFor(AcademyUnlockRule);
  const badges = repoFor(AcademyBadge);
  const missions = repoFor(AcademyMission);
  const service = new AcademyAdminService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    courses as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    packs as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    packItems as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rules as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    badges as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    missions as any,
  );
  return { service, courses, packs, packItems, rules, badges, missions };
}

describe('AcademyAdminService.createCourse', () => {
  it('applique les valeurs par défaut', async () => {
    const { service } = setup();
    const dto = await service.createCourse({ code: 'RISK', title: 'Risque' });
    expect(dto).toMatchObject({ code: 'RISK', level: 1, isPremium: false, position: 0 });
  });

  it('traduit une violation d’unicité en 409', async () => {
    const { service, courses } = setup();
    courses.save.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }));
    await expect(service.createCourse({ code: 'RISK', title: 'Risque' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('AcademyAdminService.updateCourse', () => {
  it('lève NotFound quand le cours n’existe pas', async () => {
    const { service } = setup();
    await expect(service.updateCourse('c1', { title: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('ne modifie que les champs fournis', async () => {
    const { service, courses } = setup();
    courses.findOne.mockResolvedValue(
      Object.assign(new AcademyCourse(), {
        id: 'c1',
        code: 'RISK',
        title: 'Ancien',
        level: 2,
        isPremium: true,
        summary: null,
        unlockHint: null,
        position: 5,
      }),
    );
    const dto = await service.updateCourse('c1', { title: 'Nouveau' });
    expect(dto.title).toBe('Nouveau');
    expect(dto.level).toBe(2);
    expect(dto.position).toBe(5);
  });
});

describe('AcademyAdminService.createRule', () => {
  it('accepte des seuils et applique les défauts', async () => {
    const { service } = setup();
    const dto = await service.createRule({
      code: 'R1',
      triggerEvent: 'game_finished',
      rewardType: 'xp',
      conditions: { minScore: 60, drawdownLimit: 0.2 },
    });
    expect(dto.conditions).toEqual({ minScore: 60, drawdownLimit: 0.2 });
    expect(dto.isActive).toBe(true);
    expect(dto.priority).toBe(0);
    expect(dto.xpAmount).toBe(0);
  });
});

describe('AcademyAdminService.addPackItem', () => {
  it('lève NotFound si le cours n’existe pas', async () => {
    const { service, packs } = setup();
    packs.findOne.mockResolvedValue(
      Object.assign(new AcademyPack(), { id: 'p1', code: 'P', title: 'Pack' }),
    );
    await expect(service.addPackItem('p1', { courseId: 'c1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('renvoie 409 si le cours figure déjà dans le pack', async () => {
    const { service, packs, courses, packItems } = setup();
    packs.findOne.mockResolvedValue(
      Object.assign(new AcademyPack(), { id: 'p1', code: 'P', title: 'Pack' }),
    );
    courses.findOne.mockResolvedValue(Object.assign(new AcademyCourse(), { id: 'c1' }));
    packItems.save.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }));
    await expect(service.addPackItem('p1', { courseId: 'c1' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('AcademyAdminService.removePackItem', () => {
  it('lève NotFound quand l’élément est absent', async () => {
    const { service } = setup();
    await expect(service.removePackItem('p1', 'i1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AcademyAdminService.createMission', () => {
  it('convertit les dates ISO et applique les défauts', async () => {
    const { service } = setup();
    const dto = await service.createMission({
      code: 'M1',
      title: 'Mission',
      startsAt: '2026-03-01T00:00:00.000Z',
      endsAt: null,
    });
    expect(dto.level).toBe(1);
    expect(dto.isActive).toBe(true);
    expect(dto.isPlacement).toBe(false);
    expect(dto.startsAt).toEqual(new Date('2026-03-01T00:00:00.000Z'));
    expect(dto.endsAt).toBeNull();
  });
});
