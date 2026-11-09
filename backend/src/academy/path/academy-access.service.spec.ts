import { describe, expect, it, vi } from 'vitest';
import { AcademyCourse } from '../content/academy-course.entity.js';
import { AcademyQuizAttempt } from '../content/academy-quiz-attempt.entity.js';
import { AcademyMission } from '../missions/academy-mission.entity.js';
import { AcademyGameResult } from '../results/academy-game-result.entity.js';
import { AcademyAccessService } from './academy-access.service.js';

function course(over: Partial<AcademyCourse> = {}): AcademyCourse {
  return Object.assign(new AcademyCourse(), {
    id: 'c1',
    code: 'BASES',
    title: 'Les bases',
    summary: null,
    level: 1,
    isPremium: false,
    unlockHint: null,
    position: 0,
    ...over,
  });
}

function mission(over: Partial<AcademyMission> = {}): AcademyMission {
  return Object.assign(new AcademyMission(), {
    id: 'm1',
    code: 'M1',
    level: 1,
    title: 'Mission 1',
    description: null,
    scenarioId: null,
    criteria: { minOrders: 3 },
    isPlacement: false,
    startsAt: null,
    endsAt: null,
    isActive: true,
    position: 0,
    ...over,
  });
}

function attempt(over: Partial<AcademyQuizAttempt> = {}): AcademyQuizAttempt {
  return Object.assign(new AcademyQuizAttempt(), {
    id: 'a1',
    userId: 'u1',
    courseId: 'c1',
    quizId: 'q1',
    score: '80.00',
    passed: true,
    answers: [],
    ...over,
  });
}

function result(over: Partial<AcademyGameResult> = {}): AcademyGameResult {
  return Object.assign(new AcademyGameResult(), {
    id: 'r1',
    roomId: 'room-1',
    userId: 'u1',
    scenarioId: null,
    score: '60',
    returnPercent: '8',
    maxDrawdown: '0.05',
    sharpe: '1.5',
    ordersCount: 5,
    durationSeconds: 600,
    raw: {},
    ...over,
  });
}

function setup(data: {
  courses?: AcademyCourse[];
  missions?: AcademyMission[];
  attempts?: AcademyQuizAttempt[];
  results?: AcademyGameResult[];
} = {}) {
  const courses = { find: vi.fn().mockResolvedValue(data.courses ?? []) };
  const missions = { find: vi.fn().mockResolvedValue(data.missions ?? []) };
  const attempts = { find: vi.fn().mockResolvedValue(data.attempts ?? []) };
  const results = { find: vi.fn().mockResolvedValue(data.results ?? []) };
  const service = new AcademyAccessService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    courses as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    missions as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attempts as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    results as any,
  );
  return { service };
}

describe('AcademyAccessService.getAccess', () => {
  it('ouvre le niveau 1 et verrouille le suivant sans mission réussie', async () => {
    const { service } = setup({
      courses: [course({ id: 'c1', level: 1 }), course({ id: 'c2', level: 2 })],
      missions: [mission({ id: 'm1', level: 1 })],
      attempts: [attempt({ courseId: 'c1' })],
    });
    const access = await service.getAccess('u1');
    expect(access.currentLevel).toBe(1);
    expect(access.validatedCourseIds.has('c1')).toBe(true);
    const level1 = access.levels.find((level) => level.level === 1);
    const level2 = access.levels.find((level) => level.level === 2);
    expect(level1?.open).toBe(true);
    expect(level1?.mission?.state).toBe('available');
    expect(level2?.open).toBe(false);
  });

  it('ouvre le niveau suivant quand tous les cours sont validés et la mission réussie', async () => {
    const { service } = setup({
      courses: [course({ id: 'c1', level: 1 }), course({ id: 'c2', level: 2 })],
      missions: [mission({ id: 'm1', level: 1, criteria: { minOrders: 3 } })],
      attempts: [attempt({ courseId: 'c1' })],
      results: [result({ ordersCount: 5 })],
    });
    const access = await service.getAccess('u1');
    expect(access.currentLevel).toBe(2);
    expect(access.levels.find((level) => level.level === 1)?.mission?.state).toBe('passed');
    expect(access.levels.find((level) => level.level === 2)?.open).toBe(true);
  });

  it('laisse la mission verrouillée tant que tous les cours du niveau ne sont pas validés', async () => {
    const { service } = setup({
      courses: [course({ id: 'c1', level: 1 }), course({ id: 'c2', level: 1 })],
      missions: [mission({ id: 'm1', level: 1 })],
      attempts: [attempt({ courseId: 'c1' })],
      results: [result({ ordersCount: 5 })],
    });
    const access = await service.getAccess('u1');
    const level1 = access.levels.find((level) => level.level === 1);
    expect(level1?.coursesValidated).toBe(1);
    expect(level1?.coursesTotal).toBe(2);
    expect(level1?.mission?.state).toBe('locked');
  });

  it('convertit les indicateurs textuels en nombres pour évaluer la mission', async () => {
    const { service } = setup({
      courses: [course({ id: 'c1', level: 1 })],
      missions: [mission({ id: 'm1', level: 1, criteria: { minSharpe: 1.5 } })],
      attempts: [attempt({ courseId: 'c1' })],
      results: [result({ sharpe: '1.5' })],
    });
    const access = await service.getAccess('u1');
    expect(access.levels.find((level) => level.level === 1)?.mission?.state).toBe('passed');
  });
});

describe('AcademyAccessService.getCurrentLevel', () => {
  it('renvoie le niveau courant du joueur', async () => {
    const { service } = setup({
      courses: [course({ id: 'c1', level: 1 }), course({ id: 'c2', level: 2 })],
      missions: [mission({ id: 'm1', level: 1, criteria: { minOrders: 3 } })],
      attempts: [attempt({ courseId: 'c1' })],
      results: [result({ ordersCount: 3 })],
    });
    expect(await service.getCurrentLevel('u1')).toBe(2);
  });
});
