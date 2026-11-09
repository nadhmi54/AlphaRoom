import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AcademyCourse } from './academy-course.entity.js';
import { AcademyLesson } from './academy-lesson.entity.js';
import { AcademyQuiz } from './academy-quiz.entity.js';
import { AcademyQuizQuestion } from './academy-quiz-question.entity.js';
import { AcademyQuizAttempt } from './academy-quiz-attempt.entity.js';
import { AcademyUserProgress } from '../progress/academy-user-progress.entity.js';
import { AcademyQuizService } from './academy-quiz.service.js';
import type { PlayerAccess } from '../path/academy-access.service.js';

function quiz(over: Partial<AcademyQuiz> = {}): AcademyQuiz {
  return Object.assign(new AcademyQuiz(), {
    id: '11111111-1111-4111-8111-111111111111',
    courseId: 'c1',
    lessonId: 'l1',
    code: 'Q1',
    title: 'Quiz',
    passThreshold: '70.00',
    position: 0,
    ...over,
  });
}

function question(over: Partial<AcademyQuizQuestion> = {}): AcademyQuizQuestion {
  return Object.assign(new AcademyQuizQuestion(), {
    id: '22222222-2222-4222-8222-222222222222',
    quizId: '11111111-1111-4111-8111-111111111111',
    position: 0,
    prompt: 'Question ?',
    options: ['a', 'b', 'c'],
    correctIndex: 1,
    explanation: 'car b',
    ...over,
  });
}

function course(over: Partial<AcademyCourse> = {}): AcademyCourse {
  return Object.assign(new AcademyCourse(), {
    id: 'c1',
    code: 'BASES',
    title: 'Bases',
    summary: null,
    level: 1,
    isPremium: false,
    unlockHint: null,
    position: 0,
    ...over,
  });
}

function playerAccess(over: Partial<PlayerAccess> = {}): PlayerAccess {
  return {
    userId: 'u1',
    currentLevel: 1,
    validatedCourseIds: new Set<string>(),
    levels: [],
    ...over,
  };
}

function setup(data: {
  quiz?: AcademyQuiz | null;
  questions?: AcademyQuizQuestion[];
  course?: AcademyCourse | null;
  lesson?: AcademyLesson | null;
  unlocks?: unknown[];
  currentLevel?: number;
  access?: PlayerAccess;
} = {}) {
  const quizzes = { findOne: vi.fn().mockResolvedValue(data.quiz ?? null) };
  const questions = { find: vi.fn().mockResolvedValue(data.questions ?? []) };
  const courses = { findOne: vi.fn().mockResolvedValue(data.course ?? null) };
  const lessons = { findOne: vi.fn().mockResolvedValue(data.lesson ?? null) };
  const unlocks = { find: vi.fn().mockResolvedValue(data.unlocks ?? []) };
  const progress = {
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn((x: Partial<AcademyUserProgress>) => Object.assign(new AcademyUserProgress(), x)),
    save: vi.fn(async (x: AcademyUserProgress) => x),
  };
  const attempts = {
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn((x: Partial<AcademyQuizAttempt>) => Object.assign(new AcademyQuizAttempt(), x)),
    save: vi.fn(async (x: AcademyQuizAttempt) => x),
  };
  const access = {
    getCurrentLevel: vi.fn().mockResolvedValue(data.currentLevel ?? 1),
    getAccess: vi.fn().mockResolvedValue(data.access ?? playerAccess()),
  };
  const rules = {
    processEvent: vi.fn().mockResolvedValue(undefined),
    awardBadgeByCode: vi.fn().mockResolvedValue(true),
  };
  const service = new AcademyQuizService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    quizzes as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    questions as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    courses as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lessons as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unlocks as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    progress as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attempts as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    access as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rules as any,
  );
  return { service, quizzes, questions, courses, lessons, unlocks, progress, attempts, access, rules };
}

describe('AcademyQuizService.getQuiz', () => {
  it('sert les questions sans exposer la bonne réponse ni l’explication', async () => {
    const { service } = setup({ quiz: quiz(), questions: [question()], course: course() });
    const dto = await service.getQuiz('q1', 'u1');
    expect(dto.passThreshold).toBe(70);
    expect(dto.questions).toHaveLength(1);
    expect(dto.questions[0]).not.toHaveProperty('correctIndex');
    expect(dto.questions[0]).not.toHaveProperty('explanation');
  });

  it('refuse un quiz rattaché à un cours verrouillé', async () => {
    const { service } = setup({ quiz: quiz(), course: course({ isPremium: true }) });
    await expect(service.getQuiz('q1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse un quiz d’un cours de niveau non encore ouvert', async () => {
    const { service } = setup({ quiz: quiz(), course: course({ level: 2 }), currentLevel: 1 });
    await expect(service.getQuiz('q1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('autorise un cours avancé débloqué', async () => {
    const { service } = setup({
      quiz: quiz(),
      course: course({ isPremium: true }),
      unlocks: [{ courseId: 'c1' }],
    });
    await expect(service.getQuiz('q1', 'u1')).resolves.toBeDefined();
  });

  it('lève NotFound si le quiz n’existe pas', async () => {
    const { service } = setup({ quiz: null });
    await expect(service.getQuiz('q1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AcademyQuizService.submitQuiz', () => {
  it('corrige côté serveur, enregistre la tentative et la progression', async () => {
    const { service, progress, attempts, rules } = setup({
      quiz: quiz(),
      course: course(),
      questions: [question({ id: 'q1', correctIndex: 1 }), question({ id: 'q2', correctIndex: 0 })],
    });

    const result = await service.submitQuiz('q1', 'u1', {
      answers: [
        { questionId: 'q1', selectedIndex: 1 },
        { questionId: 'q2', selectedIndex: 2 },
      ],
    });

    expect(result.score).toBe(50);
    expect(result.passed).toBe(false);
    expect(result.answers).toHaveLength(2);

    const saved = progress.save.mock.calls[0][0] as AcademyUserProgress;
    expect(saved.status).toBe('in_progress');
    expect(saved.score).toBe('50.00');

    const attempt = attempts.save.mock.calls[0][0] as AcademyQuizAttempt;
    expect(attempt).toMatchObject({ userId: 'u1', courseId: 'c1', score: '50.00', passed: false });
    expect(attempt.answers).toEqual([
      { questionId: 'q1', selectedIndex: 1 },
      { questionId: 'q2', selectedIndex: 2 },
    ]);
    expect(rules.processEvent).not.toHaveBeenCalled();
  });

  it('marque la leçon terminée et émet quiz_passed quand le seuil est atteint', async () => {
    const { service, progress, rules } = setup({
      quiz: quiz(),
      course: course(),
      questions: [question({ id: 'q1', correctIndex: 1 })],
    });
    const result = await service.submitQuiz('q1', 'u1', {
      answers: [{ questionId: 'q1', selectedIndex: 1 }],
    });
    expect(result.passed).toBe(true);
    const saved = progress.save.mock.calls[0][0] as AcademyUserProgress;
    expect(saved.status).toBe('completed');
    expect(saved.completedAt).toBeInstanceOf(Date);
    expect(rules.processEvent).toHaveBeenCalledWith({
      type: 'quiz_passed',
      userId: 'u1',
      payload: { quizId: quiz().id, courseId: 'c1' },
    });
  });

  it('attribue le badge du niveau quand tous ses cours sont validés', async () => {
    const { service, rules } = setup({
      quiz: quiz(),
      course: course(),
      questions: [question({ id: 'q1', correctIndex: 1 })],
      access: playerAccess({
        levels: [
          {
            level: 1,
            open: true,
            courses: [],
            coursesValidated: 2,
            coursesTotal: 2,
            mission: null,
          },
        ],
      }),
    });
    await service.submitQuiz('q1', 'u1', {
      answers: [{ questionId: 'q1', selectedIndex: 1 }],
    });
    expect(rules.awardBadgeByCode).toHaveBeenCalledWith('u1', 'DEBUTANT');
  });

  it('refuse la soumission si le cours est verrouillé', async () => {
    const { service } = setup({ quiz: quiz(), course: course({ isPremium: true }) });
    await expect(
      service.submitQuiz('q1', 'u1', { answers: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
