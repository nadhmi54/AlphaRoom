import { describe, expect, it } from 'vitest';
import { gradeQuiz, type GradableQuestion } from './quiz-grading.js';

const questions: GradableQuestion[] = [
  { id: 'q1', correctIndex: 0, explanation: 'explication 1' },
  { id: 'q2', correctIndex: 2, explanation: null },
  { id: 'q3', correctIndex: 1, explanation: 'explication 3' },
  { id: 'q4', correctIndex: 0, explanation: null },
];

describe('gradeQuiz', () => {
  it('donne 100 et réussit quand toutes les réponses sont bonnes', () => {
    const grade = gradeQuiz(
      questions,
      [
        { questionId: 'q1', selectedIndex: 0 },
        { questionId: 'q2', selectedIndex: 2 },
        { questionId: 'q3', selectedIndex: 1 },
        { questionId: 'q4', selectedIndex: 0 },
      ],
      70,
    );
    expect(grade.score).toBe(100);
    expect(grade.correctCount).toBe(4);
    expect(grade.passed).toBe(true);
  });

  it('applique le seuil de réussite du quiz', () => {
    // 3 bonnes réponses sur 4 = 75 %.
    const answers = [
      { questionId: 'q1', selectedIndex: 0 },
      { questionId: 'q2', selectedIndex: 2 },
      { questionId: 'q3', selectedIndex: 1 },
      { questionId: 'q4', selectedIndex: 3 },
    ];
    expect(gradeQuiz(questions, answers, 70).passed).toBe(true);
    expect(gradeQuiz(questions, answers, 75).passed).toBe(true);
    expect(gradeQuiz(questions, answers, 80).passed).toBe(false);
  });

  it('compte une question sans réponse comme fausse', () => {
    const grade = gradeQuiz(questions, [{ questionId: 'q1', selectedIndex: 0 }], 70);
    expect(grade.correctCount).toBe(1);
    expect(grade.totalQuestions).toBe(4);
    expect(grade.score).toBe(25);
    expect(grade.answers.filter((a) => a.selectedIndex === null)).toHaveLength(3);
  });

  it('ignore une réponse portant sur une question inconnue', () => {
    const grade = gradeQuiz(
      questions,
      [
        { questionId: 'q1', selectedIndex: 0 },
        { questionId: 'inconnue', selectedIndex: 0 },
      ],
      70,
    );
    expect(grade.score).toBe(25);
    expect(grade.answers).toHaveLength(4);
  });

  it('révèle l’indice correct et l’explication après correction', () => {
    const grade = gradeQuiz(questions, [{ questionId: 'q2', selectedIndex: 0 }], 50);
    const answer = grade.answers.find((a) => a.questionId === 'q2');
    expect(answer?.correctIndex).toBe(2);
    expect(answer?.correct).toBe(false);
    expect(answer?.selectedIndex).toBe(0);
  });

  it('échoue sur un quiz vide (on ne réussit pas sans répondre)', () => {
    const grade = gradeQuiz([], [], 70);
    expect(grade.score).toBe(0);
    expect(grade.passed).toBe(false);
    expect(grade.totalQuestions).toBe(0);
  });

  it('arrondit le score au centième', () => {
    // 1 bonne réponse sur 3 = 33.333… → 33.33.
    const grade = gradeQuiz(questions.slice(0, 3), [{ questionId: 'q1', selectedIndex: 0 }], 30);
    expect(grade.score).toBe(33.33);
  });
});
