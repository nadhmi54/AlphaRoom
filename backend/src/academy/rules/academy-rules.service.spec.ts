import { describe, expect, it, vi } from 'vitest';
import { AcademyCourse } from '../content/academy-course.entity.js';
import { AcademyUnlockRule } from './academy-unlock-rule.entity.js';
import { AcademyRulesService, DEFAULT_REWARD_XP, selectNextCourse } from './academy-rules.service.js';
import type { AcademyEvent } from './academy-events.js';

function rule(over: Partial<AcademyUnlockRule> = {}): AcademyUnlockRule {
  return Object.assign(new AcademyUnlockRule(), {
    id: 'rule-1',
    code: 'FIN_PARTIE',
    triggerEvent: 'game_finished',
    missionId: null,
    conditions: {},
    rewardType: 'xp',
    rewardCourseId: null,
    rewardBadgeId: null,
    xpAmount: 50,
    choiceOptions: null,
    isActive: true,
    priority: 0,
    ...over,
  });
}

function course(over: Partial<AcademyCourse> = {}): AcademyCourse {
  return Object.assign(new AcademyCourse(), {
    id: 'course-1',
    code: 'AVANCE',
    level: 2,
    position: 0,
    isPremium: true,
    ...over,
  });
}

interface SetupOptions {
  rules?: AcademyUnlockRule[];
  applied?: number;
  unlocks?: unknown[];
  badgeOwned?: number;
  badge?: unknown;
  courses?: AcademyCourse[];
  course?: AcademyCourse | null;
}

function setup(options: SetupOptions = {}) {
  const rulesRepo = { find: vi.fn().mockResolvedValue(options.rules ?? []) };
  const applicationsRepo = {
    count: vi.fn().mockResolvedValue(options.applied ?? 0),
    create: vi.fn((value: unknown) => value),
    save: vi.fn(async (value: unknown) => value),
  };
  const unlocksRepo = {
    find: vi.fn().mockResolvedValue(options.unlocks ?? []),
    create: vi.fn((value: unknown) => value),
    save: vi.fn(async (value: unknown) => value),
  };
  const userBadgesRepo = {
    count: vi.fn().mockResolvedValue(options.badgeOwned ?? 0),
    create: vi.fn((value: unknown) => value),
    save: vi.fn(async (value: unknown) => value),
  };
  const badgesRepo = { findOne: vi.fn().mockResolvedValue(options.badge ?? null) };
  const coursesRepo = {
    find: vi.fn().mockResolvedValue(options.courses ?? []),
    findOne: vi.fn().mockResolvedValue(options.course ?? null),
  };
  const progress = { addXp: vi.fn().mockResolvedValue({}) };

  const service = new AcademyRulesService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rulesRepo as any,
    applicationsRepo as any,
    unlocksRepo as any,
    userBadgesRepo as any,
    badgesRepo as any,
    coursesRepo as any,
    progress as any,
  );
  return { service, rulesRepo, applicationsRepo, unlocksRepo, userBadgesRepo, badgesRepo, coursesRepo, progress };
}

const event: AcademyEvent = {
  type: 'game_finished',
  userId: 'u1',
  roomId: 'room-1',
  metrics: { returnPercent: 8, sharpe: 1.5, maxDrawdown: 0.05, ordersCount: 5, durationSeconds: 600 },
};

describe('selectNextCourse', () => {
  it('renvoie le premier cours avancé non débloqué après le cours courant', () => {
    const current = course({ id: 'c1', level: 1, position: 0 });
    const next = selectNextCourse(
      [current, course({ id: 'c2', level: 2, position: 0 }), course({ id: 'c3', level: 2, position: 1 })],
      current,
      new Set(['c1']),
    );
    expect(next?.id).toBe('c2');
  });

  it('ignore les cours déjà débloqués et les cours de base', () => {
    const current = course({ id: 'c1', level: 1, position: 0 });
    const next = selectNextCourse(
      [course({ id: 'c2', level: 2, position: 0 }), course({ id: 'c3', level: 2, position: 1, isPremium: false })],
      current,
      new Set(['c2']),
    );
    expect(next).toBeNull();
  });
});

describe('AcademyRulesService.processEvent', () => {
  it('accorde une récompense XP et crédite les points', async () => {
    const { service, progress } = setup({ rules: [rule()] });
    const rewards = await service.processEvent(event);
    expect(rewards).toHaveLength(1);
    expect(rewards[0].rewardType).toBe('xp');
    expect(rewards[0].xp).toBe(50);
    expect(progress.addXp).toHaveBeenCalledWith('u1', 50);
  });

  it('ne réapplique jamais une règle déjà appliquée (idempotence)', async () => {
    const { service, progress } = setup({ rules: [rule()], applied: 1 });
    const rewards = await service.processEvent(event);
    expect(rewards).toHaveLength(0);
    expect(progress.addXp).not.toHaveBeenCalled();
  });

  it('ne réapplique rien si l’insertion viole l’unicité', async () => {
    const { service, applicationsRepo, progress } = setup({ rules: [rule()] });
    applicationsRepo.save.mockRejectedValue({ code: '23505' });
    const rewards = await service.processEvent(event);
    expect(rewards).toHaveLength(0);
    expect(progress.addXp).not.toHaveBeenCalled();
  });

  it('ignore les règles dont les conditions ne sont pas satisfaites', async () => {
    const { service } = setup({ rules: [rule({ conditions: { minOrders: 10 } })] });
    const rewards = await service.processEvent(event);
    expect(rewards).toHaveLength(0);
  });

  it('n’accorde aucune récompense si la limite de drawdown est dépassée', async () => {
    const { service } = setup({ rules: [rule({ conditions: { maxDrawdownLimit: 0.01 } })] });
    const rewards = await service.processEvent(event);
    expect(rewards).toHaveLength(0);
  });

  it('débloque un cours récompense', async () => {
    const { service, unlocksRepo } = setup({
      rules: [rule({ rewardType: 'course', rewardCourseId: 'course-9', xpAmount: 0 })],
    });
    const rewards = await service.processEvent(event);
    expect(rewards[0].status).toBe('granted');
    expect(rewards[0].courseId).toBe('course-9');
    expect(unlocksRepo.save).toHaveBeenCalled();
  });

  it('offre le cours suivant quand la récompense est déjà possédée', async () => {
    const current = course({ id: 'course-9', level: 1, position: 0 });
    const following = course({ id: 'course-10', level: 2, position: 0 });
    const { service } = setup({
      rules: [rule({ rewardType: 'course', rewardCourseId: 'course-9', xpAmount: 0 })],
      unlocks: [{ courseId: 'course-9' }],
      course: current,
      courses: [current, following],
    });
    const rewards = await service.processEvent(event);
    expect(rewards[0].status).toBe('granted');
    expect(rewards[0].courseId).toBe('course-10');
  });

  it('convertit en XP quand la récompense est possédée et qu’il n’y a plus de cours suivant', async () => {
    const current = course({ id: 'course-9', level: 2, position: 0 });
    const { service } = setup({
      rules: [rule({ rewardType: 'course', rewardCourseId: 'course-9', xpAmount: 0 })],
      unlocks: [{ courseId: 'course-9' }],
      course: current,
      courses: [current],
    });
    const rewards = await service.processEvent(event);
    expect(rewards[0].status).toBe('converted_to_xp');
    expect(rewards[0].xp).toBe(DEFAULT_REWARD_XP);
  });

  it('attribue un badge', async () => {
    const { service, userBadgesRepo } = setup({
      rules: [rule({ rewardType: 'badge', rewardBadgeId: 'badge-1', xpAmount: 0 })],
      badge: { id: 'badge-1', code: 'NIVEAU_2' },
    });
    const rewards = await service.processEvent(event);
    expect(rewards[0].rewardType).toBe('badge');
    expect(rewards[0].badgeCode).toBe('NIVEAU_2');
    expect(userBadgesRepo.save).toHaveBeenCalled();
  });

  it('convertit en XP un badge déjà obtenu', async () => {
    const { service } = setup({
      rules: [rule({ rewardType: 'badge', rewardBadgeId: 'badge-1', xpAmount: 0 })],
      badgeOwned: 1,
    });
    const rewards = await service.processEvent(event);
    expect(rewards[0].status).toBe('converted_to_xp');
  });

  it('marque une récompense « au choix » comme en attente sans rien accorder', async () => {
    const { service, progress } = setup({
      rules: [rule({ rewardType: 'course_choice', choiceOptions: ['c1', 'c2'], xpAmount: 0 })],
    });
    const rewards = await service.processEvent(event);
    expect(rewards[0].rewardType).toBe('course_choice');
    expect(rewards[0].status).toBe('pending_choice');
    expect(progress.addXp).not.toHaveBeenCalled();
  });

  it('ne retient que les règles générales et celles de la mission de l’événement', async () => {
    const { service, rulesRepo } = setup({
      rules: [
        rule({ id: 'r-general' }),
        rule({ id: 'r-mission-1', missionId: 'mission-1' }),
        rule({ id: 'r-mission-2', missionId: 'mission-2' }),
      ],
    });
    const rewards = await service.processEvent({ ...event, missionId: 'mission-1' });
    expect(rulesRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { triggerEvent: 'game_finished', isActive: true } }),
    );
    expect(rewards.map((r) => r.ruleId)).toEqual(['r-general', 'r-mission-1']);
  });
});

describe('AcademyRulesService.awardBadgeByCode', () => {
  it('attribue le badge de niveau quand il est connu et non possédé', async () => {
    const { service, userBadgesRepo } = setup({ badge: { id: 'badge-1', code: 'DEBUTANT' } });
    expect(await service.awardBadgeByCode('u1', 'DEBUTANT')).toBe(true);
    expect(userBadgesRepo.save).toHaveBeenCalledOnce();
  });

  it('ne réattribue pas un badge déjà possédé (idempotence)', async () => {
    const { service, userBadgesRepo } = setup({
      badge: { id: 'badge-1', code: 'DEBUTANT' },
      badgeOwned: 1,
    });
    expect(await service.awardBadgeByCode('u1', 'DEBUTANT')).toBe(false);
    expect(userBadgesRepo.save).not.toHaveBeenCalled();
  });

  it('renvoie false pour un code de badge inconnu', async () => {
    const { service } = setup({ badge: null });
    expect(await service.awardBadgeByCode('u1', 'INCONNU')).toBe(false);
  });

  it('tolère une insertion concurrente rejetée par l’unicité', async () => {
    const { service, userBadgesRepo } = setup({ badge: { id: 'badge-1', code: 'DEBUTANT' } });
    userBadgesRepo.save.mockRejectedValue({ code: '23505' });
    expect(await service.awardBadgeByCode('u1', 'DEBUTANT')).toBe(false);
  });
});
