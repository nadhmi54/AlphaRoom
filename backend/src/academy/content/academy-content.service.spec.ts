import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AcademyCourse } from './academy-course.entity.js';
import { AcademyLesson } from './academy-lesson.entity.js';
import { AcademyContentService, isCourseUnlocked } from './academy-content.service.js';

function course(over: Partial<AcademyCourse> = {}): AcademyCourse {
  return Object.assign(new AcademyCourse(), {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'BASES',
    title: 'Les bases',
    summary: 'Sommaire',
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
    code: 'L1',
    title: 'Leçon 1',
    kind: 'text',
    content: 'contenu',
    videoUrl: null,
    durationMinutes: 5,
    position: 0,
    ...over,
  });
}

function setup(
  courses: AcademyCourse[] = [],
  lessons: AcademyLesson[] = [],
  unlocks: unknown[] = [],
  currentLevel = 1,
) {
  const coursesRepo = { find: vi.fn().mockResolvedValue(courses), findOne: vi.fn() };
  const lessonsRepo = { find: vi.fn().mockResolvedValue(lessons) };
  const unlocksRepo = { find: vi.fn().mockResolvedValue(unlocks) };
  const access = { getCurrentLevel: vi.fn().mockResolvedValue(currentLevel) };
  const service = new AcademyContentService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    coursesRepo as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lessonsRepo as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unlocksRepo as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    access as any,
  );
  return { service, coursesRepo, lessonsRepo, unlocksRepo, access };
}

describe('isCourseUnlocked', () => {
  it('ouvre un cours de base sans aucun déblocage', () => {
    expect(isCourseUnlocked({ id: 'c1', isPremium: false }, new Set())).toBe(true);
  });

  it('verrouille un cours avancé sans déblocage', () => {
    expect(isCourseUnlocked({ id: 'c1', isPremium: true }, new Set())).toBe(false);
  });

  it('ouvre un cours avancé dès que le cours figure dans les déblocages', () => {
    expect(isCourseUnlocked({ id: 'c1', isPremium: true }, new Set(['c1']))).toBe(true);
  });
});

describe('AcademyContentService.listCatalog', () => {
  it('marque les cours verrouillés et garde leur condition visible', async () => {
    const { service } = setup([
      course({ id: 'c1', isPremium: false }),
      course({ id: 'c2', isPremium: true, unlockHint: 'Gagnez une partie', code: 'AVANCE' }),
    ]);
    const catalog = await service.listCatalog('u1');
    expect(catalog).toHaveLength(2);
    expect(catalog[0].unlocked).toBe(true);
    expect(catalog[1].unlocked).toBe(false);
    expect(catalog[1].unlockHint).toBe('Gagnez une partie');
  });

  it('ouvre un cours avancé présent dans les déblocages du joueur', async () => {
    const { service } = setup(
      [course({ id: 'c2', isPremium: true, unlockHint: 'x' })],
      [],
      [{ courseId: 'c2' }, { courseId: null, badgeId: 'b1' }],
    );
    const catalog = await service.listCatalog('u1');
    expect(catalog[0].unlocked).toBe(true);
  });

  it('verrouille un cours d’un niveau non encore ouvert', async () => {
    const { service } = setup([course({ id: 'c3', level: 2 })], [], [], 1);
    const catalog = await service.listCatalog('u1');
    expect(catalog[0].unlocked).toBe(false);
  });
});

describe('AcademyContentService.getCourse', () => {
  it('renvoie le détail et ses leçons quand le cours est accessible', async () => {
    const { service, coursesRepo } = setup([], [lesson()]);
    coursesRepo.findOne.mockResolvedValue(course({ isPremium: false }));
    const detail = await service.getCourse('c1', 'u1');
    expect(detail.lessons).toHaveLength(1);
    expect(detail.lessons[0].content).toBe('contenu');
  });

  it('refuse le contenu d’un cours verrouillé côté serveur', async () => {
    const { service, coursesRepo } = setup([], [lesson()]);
    coursesRepo.findOne.mockResolvedValue(course({ isPremium: true, unlockHint: 'Gagnez une partie' }));
    await expect(service.getCourse('c1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse un cours d’un niveau non encore ouvert', async () => {
    const { service, coursesRepo } = setup([], [lesson()], [], 1);
    coursesRepo.findOne.mockResolvedValue(course({ level: 2 }));
    await expect(service.getCourse('c1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lève NotFound si le cours n’existe pas', async () => {
    const { service, coursesRepo } = setup();
    coursesRepo.findOne.mockResolvedValue(null);
    await expect(service.getCourse('c1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
