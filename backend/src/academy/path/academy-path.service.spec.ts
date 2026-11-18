import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AcademyQuizAttempt } from '../content/academy-quiz-attempt.entity.js';
import type { QuizDto } from '../content/dto/quiz.dto.js';
import type { PlayerAccess } from './academy-access.service.js';
import { AcademyPathService } from './academy-path.service.js';

function access(over: Partial<PlayerAccess> = {}): PlayerAccess {
  return {
    userId: 'u1',
    currentLevel: 1,
    validatedCourseIds: new Set<string>(),
    levels: [],
    ...over,
  };
}

function setup(data: {
  access?: PlayerAccess;
  catalog?: Array<{ id: string }>;
  catalogThrows?: unknown;
  lastAttempt?: Partial<AcademyQuizAttempt> | null;
  quiz?: Partial<QuizDto> | null;
} = {}) {
  const accessService = { getAccess: vi.fn().mockResolvedValue(data.access ?? access()) };
  const badges = {
    listBadges: vi.fn().mockResolvedValue([
      { code: 'DEBUTANT', title: 'Débutant', icon: 'niveau' },
    ]),
    getMyBadges: vi.fn().mockResolvedValue([{ code: 'DEBUTANT' }]),
  };
  const catalog = {
    listCourseQuizzes: data.catalogThrows
      ? vi.fn().mockRejectedValue(data.catalogThrows)
      : vi.fn().mockResolvedValue(data.catalog ?? []),
  };
  const quizzes = {
    getQuiz: vi
      .fn()
      .mockResolvedValue(data.quiz ?? { id: 'q2', code: 'Q', title: 'Quiz', passThreshold: 70, questions: [] }),
  };
  const attempts = { findOne: vi.fn().mockResolvedValue(data.lastAttempt ?? null) };
  const service = new AcademyPathService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessService as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    badges as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    catalog as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    quizzes as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attempts as any,
  );
  return { service, accessService, badges, catalog, quizzes, attempts };
}

describe('AcademyPathService.getPath', () => {
  it('assemble les niveaux, le badge de niveau et sa condition de mission', async () => {
    const { service } = setup({
      access: access({
        currentLevel: 1,
        levels: [
          {
            level: 1,
            open: true,
            courses: [{ id: 'c1', code: 'BASES', title: 'Les bases', position: 0, validated: true }],
            coursesValidated: 1,
            coursesTotal: 1,
            mission: {
              id: 'm1',
              code: 'M1',
              title: 'Mission 1',
              description: null,
              criteria: { minOrders: 3 },
              isPlacement: false,
              state: 'available',
            },
          },
        ],
      }),
    });
    const path = await service.getPath('u1');
    expect(path.currentLevel).toBe(1);
    expect(path.levels).toHaveLength(1);
    expect(path.levels[0].coursesValidated).toBe(1);
    expect(path.levels[0].badge).toMatchObject({ code: 'DEBUTANT', awarded: true });
    expect(path.levels[0].mission?.state).toBe('available');
    expect(path.levels[0].mission?.unlockCondition).toContain('disponible');
  });
});

describe('AcademyPathService.drawCourseQuiz', () => {
  it('exclut le dernier quiz tenté du tirage', async () => {
    const { service, quizzes } = setup({
      catalog: [{ id: 'q1' }, { id: 'q2' }],
      lastAttempt: { quizId: 'q1' },
    });
    await service.drawCourseQuiz('c1', 'u1');
    expect(quizzes.getQuiz).toHaveBeenCalledWith('q2', 'u1');
  });

  it('renvoie l’unique quiz disponible même s’il a déjà été tenté', async () => {
    const { service, quizzes } = setup({
      catalog: [{ id: 'q1' }],
      lastAttempt: { quizId: 'q1' },
    });
    await service.drawCourseQuiz('c1', 'u1');
    expect(quizzes.getQuiz).toHaveBeenCalledWith('q1', 'u1');
  });

  it('lève NotFound quand le cours n’a aucun quiz', async () => {
    const { service } = setup({ catalog: [] });
    await expect(service.drawCourseQuiz('c1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
