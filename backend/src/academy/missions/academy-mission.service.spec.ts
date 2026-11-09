import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AcademyMission } from './academy-mission.entity.js';
import { AcademyMissionService } from './academy-mission.service.js';
import type { LevelInfo, PlayerAccess } from '../path/academy-access.service.js';

function mission(over: Partial<AcademyMission> = {}): AcademyMission {
  return Object.assign(new AcademyMission(), {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'M1',
    level: 1,
    title: 'Mission 1',
    description: null,
    scenarioId: 'panic_tuesday',
    criteria: { minOrders: 5 },
    isPlacement: false,
    startsAt: null,
    endsAt: null,
    isActive: true,
    position: 0,
    ...over,
  });
}

function levelInfo(over: Partial<LevelInfo> = {}): LevelInfo {
  return {
    level: 1,
    open: true,
    courses: [],
    coursesValidated: 0,
    coursesTotal: 1,
    mission: null,
    ...over,
  };
}

function setup(rows: AcademyMission[], levels: LevelInfo[] = []) {
  const missions = {
    find: vi.fn().mockResolvedValue(rows),
    findOne: vi.fn(),
  };
  const playerAccess: PlayerAccess = {
    userId: 'u1',
    currentLevel: 1,
    validatedCourseIds: new Set<string>(),
    levels,
  };
  const access = { getAccess: vi.fn().mockResolvedValue(playerAccess) };
  const service = new AcademyMissionService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    missions as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    access as any,
  );
  return { service, missions, access };
}

describe('AcademyMissionService.listMissions', () => {
  it('expose les critères et l’état d’ouverture', async () => {
    const now = new Date('2026-03-01T12:00:00Z');
    const { service } = setup([
      mission({ id: 'm1' }),
      mission({
        id: 'm2',
        isActive: true,
        startsAt: new Date('2026-04-01T00:00:00Z'),
        endsAt: null,
      }),
    ]);
    const list = await service.listMissions('u1', now);
    expect(list).toHaveLength(2);
    expect(list[0].criteria).toEqual({ minOrders: 5 });
    expect(list[0].open).toBe(true);
    expect(list[1].open).toBe(false);
  });

  it('marque une mission inactive comme fermée', async () => {
    const { service } = setup([mission({ isActive: false })]);
    const [only] = await service.listMissions('u1', new Date('2026-03-01T12:00:00Z'));
    expect(only.open).toBe(false);
  });

  it('reflète l’état du parcours (disponible) avec la condition', async () => {
    const { service } = setup(
      [mission({ id: 'm1', level: 1 })],
      [
        levelInfo({
          level: 1,
          mission: {
            id: 'm1',
            code: 'M1',
            title: 'Mission 1',
            description: null,
            criteria: { minOrders: 5 },
            isPlacement: false,
            state: 'available',
          },
        }),
      ],
    );
    const [only] = await service.listMissions('u1');
    expect(only.state).toBe('available');
    expect(only.unlockCondition).toContain('disponible');
  });

  it('verrouille une mission d’un niveau non encore atteint', async () => {
    const { service } = setup([mission({ id: 'm3', level: 3 })]);
    const [only] = await service.listMissions('u1');
    expect(only.state).toBe('locked');
    expect(only.unlockCondition).toContain('niveau 3');
  });
});

describe('AcademyMissionService.getMission', () => {
  it('lève NotFound si la mission n’existe pas', async () => {
    const { service, missions } = setup([]);
    missions.findOne.mockResolvedValue(null);
    await expect(service.getMission('m1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('renvoie le détail d’une mission existante', async () => {
    const { service, missions } = setup([], [levelInfo({ level: 3, mission: null })]);
    missions.findOne.mockResolvedValue(mission({ isPlacement: true, level: 3 }));
    const dto = await service.getMission('m1', 'u1');
    expect(dto.isPlacement).toBe(true);
    expect(dto.level).toBe(3);
  });
});
