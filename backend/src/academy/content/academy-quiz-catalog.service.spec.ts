import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AcademyCourse } from './academy-course.entity.js';
import { AcademyLesson } from './academy-lesson.entity.js';
import { AcademyQuiz } from './academy-quiz.entity.js';
import { AcademyQuizQuestion } from './academy-quiz-question.entity.js';
import { AcademyUserUnlock } from '../progress/academy-user-unlock.entity.js';
import { AcademyQuizCatalogService } from './academy-quiz-catalog.service.js';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';

function course(over: Partial<AcademyCourse> = {}): AcademyCourse {
  return Object.assign(new AcademyCourse(), {
    id: COURSE_ID,
    code: 'RISK',
    title: 'Risque',
    level: 1,
    isPremium: false,
    unlockHint: null,
    ...over,
  });
}

function quiz(over: Partial<AcademyQuiz> = {}): AcademyQuiz {
  return Object.assign(new AcademyQuiz(), {
    id: 'q1',
    courseId: COURSE_ID,
    lessonId: null,
    code: 'Q1',
    title: 'Quiz 1',
    passThreshold: '70',
    position: 0,
    ...over,
  });
}

function setup(rows: {
  course?: AcademyCourse | null;
  lessons?: AcademyLesson[];
  quizzes?: AcademyQuiz[];
  questions?: AcademyQuizQuestion[];
  unlocks?: AcademyUserUnlock[];
  currentLevel?: number;
}) {
  const courses = { findOne: vi.fn().mockResolvedValue(rows.course ?? null) };
  const lessons = { find: vi.fn().mockResolvedValue(rows.lessons ?? []) };
  const quizzes = { find: vi.fn().mockResolvedValue(rows.quizzes ?? []) };
  const questions = { find: vi.fn().mockResolvedValue(rows.questions ?? []) };
  const unlocks = { find: vi.fn().mockResolvedValue(rows.unlocks ?? []) };
  const access = { getCurrentLevel: vi.fn().mockResolvedValue(rows.currentLevel ?? 1) };
  const service = new AcademyQuizCatalogService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    courses as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lessons as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    quizzes as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    questions as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unlocks as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    access as any,
  );
  return { service };
}

describe('AcademyQuizCatalogService.listCourseQuizzes', () => {
  it('lève NotFound si le cours n’existe pas', async () => {
    const { service } = setup({ course: null });
    await expect(service.listCourseQuizzes(COURSE_ID, 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuse un cours avancé non débloqué', async () => {
    const { service } = setup({ course: course({ isPremium: true, unlockHint: 'Gagne une partie.' }) });
    await expect(service.listCourseQuizzes(COURSE_ID, 'u1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('renvoie les quiz avec le nombre de questions', async () => {
    const { service } = setup({
      course: course(),
      quizzes: [quiz({ id: 'q1' }), quiz({ id: 'q2', code: 'Q2', title: 'Quiz 2' })],
      questions: [
        Object.assign(new AcademyQuizQuestion(), { quizId: 'q1' }),
        Object.assign(new AcademyQuizQuestion(), { quizId: 'q1' }),
        Object.assign(new AcademyQuizQuestion(), { quizId: 'q2' }),
      ],
    });
    const list = await service.listCourseQuizzes(COURSE_ID, 'u1');
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: 'q1', passThreshold: 70, questionCount: 2 });
    expect(list[1]).toMatchObject({ id: 'q2', questionCount: 1 });
  });

  it('refuse un cours dont le niveau n’est pas encore ouvert', async () => {
    const { service } = setup({ course: course({ level: 2 }), currentLevel: 1 });
    await expect(service.listCourseQuizzes(COURSE_ID, 'u1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('renvoie une liste vide quand le cours n’a aucun quiz', async () => {
    const { service } = setup({ course: course(), quizzes: [] });
    expect(await service.listCourseQuizzes(COURSE_ID, 'u1')).toEqual([]);
  });
});
