import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import type { Repository } from 'typeorm';
import { AcademyCourse } from './academy-course.entity.js';
import { AcademyLesson } from './academy-lesson.entity.js';
import { AcademyQuiz } from './academy-quiz.entity.js';
import { AcademyQuizQuestion } from './academy-quiz-question.entity.js';
import { AcademyQuizAttempt } from './academy-quiz-attempt.entity.js';
import { isCourseUnlocked } from './academy-content.service.js';
import { AcademyUserProgress } from '../progress/academy-user-progress.entity.js';
import { AcademyUserUnlock } from '../progress/academy-user-unlock.entity.js';
import { AcademyAccessService } from '../path/academy-access.service.js';
import { isLevelOpen, levelBadgeCode } from '../path/path-logic.js';
import { AcademyRulesService } from '../rules/academy-rules.service.js';
import { gradeQuiz } from './quiz-grading.js';
import { QuizDto, QuizResultDto, SubmitQuizDto, type QuizAnswerDto } from './dto/quiz.dto.js';

/**
 * Passage et correction des quiz. La correction est faite exclusivement côté
 * serveur : les bonnes réponses ne quittent jamais la base avant soumission, et
 * le score envoyé par le navigateur n'est jamais utilisé.
 *
 * Chaque tentative est enregistrée (`academy_quiz_attempts`) : c'est elle qui
 * matérialise « un cours est validé quand l'un de ses quiz est réussi » et qui
 * alimente l'exclusion du dernier quiz tenté lors du tirage aléatoire suivant.
 * Un cours verrouillé (contenu avancé non débloqué, ou niveau supérieur non
 * ouvert) est refusé avant toute correction.
 */
@Injectable()
export class AcademyQuizService {
  constructor(
    @InjectRepository(AcademyQuiz)
    private readonly quizzes: Repository<AcademyQuiz>,
    @InjectRepository(AcademyQuizQuestion)
    private readonly questions: Repository<AcademyQuizQuestion>,
    @InjectRepository(AcademyCourse)
    private readonly courses: Repository<AcademyCourse>,
    @InjectRepository(AcademyLesson)
    private readonly lessons: Repository<AcademyLesson>,
    @InjectRepository(AcademyUserUnlock)
    private readonly unlocks: Repository<AcademyUserUnlock>,
    @InjectRepository(AcademyUserProgress)
    private readonly progress: Repository<AcademyUserProgress>,
    @InjectRepository(AcademyQuizAttempt)
    private readonly attempts: Repository<AcademyQuizAttempt>,
    private readonly access: AcademyAccessService,
    private readonly rules: AcademyRulesService,
  ) {}

  /** Quiz à passer, sans les bonnes réponses. Refusé si le cours est verrouillé. */
  async getQuiz(quizId: string, userId: string): Promise<QuizDto> {
    const quiz = await this.requireQuiz(quizId);
    await this.assertCourseAccessible(quiz, userId);
    const questions = await this.questions.find({
      where: { quizId: quiz.id },
      order: { position: 'ASC' },
    });
    return plainToInstance(QuizDto, {
      id: quiz.id,
      code: quiz.code,
      title: quiz.title,
      courseId: quiz.courseId,
      lessonId: quiz.lessonId,
      passThreshold: Number(quiz.passThreshold),
      // Projection explicite : `correctIndex` et `explanation` ne doivent
      // jamais sortir ici.
      questions: questions.map((question) => ({
        id: question.id,
        position: question.position,
        prompt: question.prompt,
        options: question.options,
      })),
    });
  }

  /**
   * Corrige une copie côté serveur, enregistre la tentative et, en cas de
   * réussite, déclenche le moteur de règles puis l'attribution du badge de
   * niveau quand tous les cours du niveau sont validés.
   */
  async submitQuiz(quizId: string, userId: string, dto: SubmitQuizDto): Promise<QuizResultDto> {
    const quiz = await this.requireQuiz(quizId);
    await this.assertCourseAccessible(quiz, userId);

    const questions = await this.questions.find({
      where: { quizId: quiz.id },
      order: { position: 'ASC' },
    });
    const threshold = Number(quiz.passThreshold);
    const grade = gradeQuiz(
      questions.map((question) => ({
        id: question.id,
        correctIndex: question.correctIndex,
        explanation: question.explanation,
      })),
      dto.answers,
      threshold,
    );

    const courseId = await this.resolveCourseId(quiz);
    if (quiz.lessonId && courseId) {
      await this.recordLessonScore(userId, quiz, courseId, grade.score, grade.passed);
    }

    if (courseId) {
      await this.recordAttempt(userId, courseId, quiz.id, grade.score, grade.passed, dto.answers);
      if (grade.passed) {
        await this.rules.processEvent({
          type: 'quiz_passed',
          userId,
          payload: { quizId: quiz.id, courseId },
        });
        await this.awardLevelBadgeIfComplete(userId, courseId);
      }
    }

    return plainToInstance(QuizResultDto, {
      quizId: quiz.id,
      score: grade.score,
      passed: grade.passed,
      correctCount: grade.correctCount,
      totalQuestions: grade.totalQuestions,
      threshold,
      answers: grade.answers,
    });
  }

  private async requireQuiz(quizId: string): Promise<AcademyQuiz> {
    const quiz = await this.quizzes.findOne({ where: { id: quizId } });
    if (!quiz) throw new NotFoundException('Quiz introuvable.');
    return quiz;
  }

  /**
   * Détermine le cours d'un quiz (directement, ou via la leçon) et refuse
   * l'accès si ce cours est verrouillé pour ce joueur — verrou de contenu
   * avancé (`isPremium`) ou niveau non encore ouvert. Un quiz sans rattachement
   * est accessible à toute personne connectée.
   */
  private async assertCourseAccessible(quiz: AcademyQuiz, userId: string): Promise<void> {
    const courseId = await this.resolveCourseId(quiz);
    if (!courseId) return;

    const course = await this.courses.findOne({ where: { id: courseId } });
    if (!course) return;

    const unlockRows = await this.unlocks.find({ where: { userId } });
    const unlocked = new Set(
      unlockRows.filter((row) => row.courseId).map((row) => row.courseId as string),
    );
    const currentLevel = await this.access.getCurrentLevel(userId);
    if (!isCourseUnlocked(course, unlocked) || !isLevelOpen(course.level, currentLevel)) {
      throw new ForbiddenException(
        course.unlockHint
          ? `Ce cours est verrouillé : ${course.unlockHint}`
          : 'Ce cours est verrouillé.',
      );
    }
  }

  /** Cours d'un quiz : directement, ou via sa leçon. `null` si non rattaché. */
  private async resolveCourseId(quiz: AcademyQuiz): Promise<string | null> {
    if (quiz.courseId) return quiz.courseId;
    if (quiz.lessonId) {
      const lesson = await this.lessons.findOne({ where: { id: quiz.lessonId } });
      return lesson?.courseId ?? null;
    }
    return null;
  }

  /** Enregistre la tentative (score serveur, réussite, date) pour le parcours. */
  private async recordAttempt(
    userId: string,
    courseId: string,
    quizId: string,
    score: number,
    passed: boolean,
    answers: QuizAnswerDto[],
  ): Promise<void> {
    await this.attempts.save(
      this.attempts.create({
        userId,
        courseId,
        quizId,
        score: score.toFixed(2),
        passed,
        answers: answers.map((answer) => ({
          questionId: answer.questionId,
          selectedIndex: answer.selectedIndex,
        })),
      }),
    );
  }

  /**
   * Attribue le badge du niveau quand tous ses cours sont validés. Idempotent :
   * `awardBadgeByCode` ne crée jamais deux fois le même badge.
   */
  private async awardLevelBadgeIfComplete(userId: string, courseId: string): Promise<void> {
    const course = await this.courses.findOne({ where: { id: courseId } });
    if (!course) return;

    const access = await this.access.getAccess(userId);
    const level = access.levels.find((info) => info.level === course.level);
    if (!level || level.coursesTotal === 0 || level.coursesValidated < level.coursesTotal) return;

    await this.rules.awardBadgeByCode(userId, levelBadgeCode(course.level));
  }

  /** Crée ou met à jour la progression de la leçon avec le score du quiz. */
  private async recordLessonScore(
    userId: string,
    quiz: AcademyQuiz,
    courseId: string,
    score: number,
    passed: boolean,
  ): Promise<void> {
    const lessonId = quiz.lessonId as string;

    let row = await this.progress.findOne({ where: { userId, lessonId } });
    if (!row) {
      row = this.progress.create({ userId, courseId, lessonId, status: 'not_started' });
    }
    row.status = passed ? 'completed' : 'in_progress';
    row.score = score.toFixed(2);
    if (passed && !row.completedAt) row.completedAt = new Date();
    await this.progress.save(row);
  }
}
