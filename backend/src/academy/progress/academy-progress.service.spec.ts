import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AcademyCourse } from '../content/academy-course.entity.js';
import { AcademyLesson } from '../content/academy-lesson.entity.js';
import { AcademyUserProgress } from './academy-user-progress.entity.js';
import { AcademyUserStats } from './academy-user-stats.entity.js';
import {
  AcademyProgressService,
  levelForXp,
  xpForLevel,
  XP_PER_LEVEL,
} from './academy-progress.service.js';

function course(over: Partial<AcademyCourse> = {}): AcademyCourse {
  return Object.assign(new AcademyCourse(), {
    id: '11111111-1111-4111-8111-111111111111',
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

function lesson(over: Partial<AcademyLesson> = {}): AcademyLesson {
  return Object.assign(new AcademyLesson(), {
    id: '22222222-2222-4222-8222-222222222222',
    courseId: '11111111-1111-4111-8111-111111111111',
    code: null,
    title: 'Leçon 1',
    kind: 'text',
    content: null,
    videoUrl: null,
    durationMinutes: 0,
    position: 0,
    ...over,
  });
}

function setup(data: {
  courses?: AcademyCourse[];
  lessons?: AcademyLesson[];
  progressRows?: AcademyUserProgress[];
  stats?: AcademyUserStats | null;
  unlocks?: unknown[];
  currentLevel?: number;
} = {}) {
  const courses = { find: vi.fn().mockResolvedValue(data.courses ?? []), findOne: vi.fn() };
  const lessons = { find: vi.fn().mockResolvedValue(data.lessons ?? []), findOne: vi.fn() };
  const progress = {
    find: vi.fn().mockResolvedValue(data.progressRows ?? []),
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn((x: Partial<AcademyUserProgress>) => Object.assign(new AcademyUserProgress(), x)),
    save: vi.fn(async (x: AcademyUserProgress) => x),
  };
  const stats = {
    findOne: vi.fn().mockResolvedValue(data.stats ?? null),
    create: vi.fn((x: Partial<AcademyUserStats>) => Object.assign(new AcademyUserStats(), x)),
    save: vi.fn(async (x: AcademyUserStats) => x),
  };
  const unlocks = { find: vi.fn().mockResolvedValue(data.unlocks ?? []) };
  const access = { getCurrentLevel: vi.fn().mockResolvedValue(data.currentLevel ?? 1) };
  const service = new AcademyProgressService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    courses as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lessons as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    progress as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stats as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unlocks as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    access as any,
  );
  return { service, courses, lessons, progress, stats, unlocks, access };
}

describe('levelForXp / xpForLevel', () => {
  it('commence au niveau 1 avec 0 XP', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(-10)).toBe(1);
  });

  it('franchit un palier tous les XP_PER_LEVEL', () => {
    expect(levelForXp(XP_PER_LEVEL - 1)).toBe(1);
    expect(levelForXp(XP_PER_LEVEL)).toBe(2);
    expect(levelForXp(XP_PER_LEVEL * 3 + 5)).toBe(4);
  });

  it('xpForLevel est l’inverse de levelForXp sur les paliers', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(4)).toBe(XP_PER_LEVEL * 3);
    expect(levelForXp(xpForLevel(4))).toBe(4);
  });
});

describe('AcademyProgressService.getMyProgress', () => {
  it('agrège l’avancement par compétence et calcule le niveau', async () => {
    const c = course();
    const { service } = setup({
      courses: [c],
      lessons: [
        lesson({ id: 'l1' }),
        lesson({ id: 'l2', position: 1 }),
      ],
      progressRows: [
        Object.assign(new AcademyUserProgress(), { lessonId: 'l1', status: 'completed' }),
      ],
      stats: Object.assign(new AcademyUserStats(), { userId: 'u1', xp: 120, level: 2 }),
    });
    const view = await service.getMyProgress('u1');
    expect(view.level).toBe(2);
    expect(view.nextLevelXp).toBe(XP_PER_LEVEL * 2);
    expect(view.xpToNextLevel).toBe(XP_PER_LEVEL * 2 - 120);
    expect(view.skills).toHaveLength(1);
    expect(view.skills[0].completedLessons).toBe(1);
    expect(view.skills[0].totalLessons).toBe(2);
    expect(view.skills[0].percent).toBe(50);
    expect(view.percentCompleted).toBe(50);
  });

  it('retombe sur 0 XP / niveau 1 sans ligne de stats (lecture sans écriture)', async () => {
    const { service, stats } = setup({ courses: [course()], lessons: [lesson()] });
    const view = await service.getMyProgress('u1');
    expect(view.xp).toBe(0);
    expect(view.level).toBe(1);
    expect(stats.save).not.toHaveBeenCalled();
  });
});

describe('AcademyProgressService.updateLessonProgress', () => {
  it('refuse la progression sur un cours verrouillé', async () => {
    const { service, courses, lessons } = setup();
    lessons.findOne.mockResolvedValue(lesson());
    courses.findOne.mockResolvedValue(course({ isPremium: true }));
    await expect(
      service.updateLessonProgress('u1', 'l1', { status: 'in_progress' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse la progression sur un cours d’un niveau verrouillé', async () => {
    const { service, courses, lessons } = setup({ currentLevel: 1 });
    lessons.findOne.mockResolvedValue(lesson());
    courses.findOne.mockResolvedValue(course({ level: 2 }));
    await expect(
      service.updateLessonProgress('u1', 'l1', { status: 'in_progress' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lève NotFound quand la leçon n’existe pas', async () => {
    const { service, lessons } = setup();
    lessons.findOne.mockResolvedValue(null);
    await expect(
      service.updateLessonProgress('u1', 'l1', { status: 'in_progress' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crée la ligne de progression et horodate la complétion', async () => {
    const { service, courses, lessons, progress } = setup();
    lessons.findOne.mockResolvedValue(lesson({ id: 'l1' }));
    courses.findOne.mockResolvedValue(course());
    await service.updateLessonProgress('u1', 'l1', { status: 'completed', score: 80 });
    expect(progress.save).toHaveBeenCalledOnce();
    const saved = progress.save.mock.calls[0][0] as AcademyUserProgress;
    expect(saved.status).toBe('completed');
    expect(saved.score).toBe('80.00');
    expect(saved.completedAt).toBeInstanceOf(Date);
  });
});

describe('AcademyProgressService.addXp', () => {
  it('cumule l’XP et recalcule le niveau', async () => {
    const { service } = setup({
      stats: Object.assign(new AcademyUserStats(), { userId: 'u1', xp: 50, level: 1 }),
    });
    const updated = await service.addXp('u1', 60);
    expect(updated.xp).toBe(110);
    expect(updated.level).toBe(2);
  });

  it('crée la ligne de stats au premier gain', async () => {
    const { service, stats } = setup({ stats: null });
    const updated = await service.addXp('u1', 30);
    expect(stats.create).toHaveBeenCalledOnce();
    expect(updated.xp).toBe(30);
  });
});
