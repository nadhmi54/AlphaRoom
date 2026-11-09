import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { In, type Repository } from 'typeorm';
import { AcademyCourse } from './academy-course.entity.js';
import { AcademyLesson } from './academy-lesson.entity.js';
import { AcademyQuiz } from './academy-quiz.entity.js';
import { AcademyQuizQuestion } from './academy-quiz-question.entity.js';
import { AcademyUserUnlock } from '../progress/academy-user-unlock.entity.js';
import { AcademyAccessService } from '../path/academy-access.service.js';
import { isLevelOpen } from '../path/path-logic.js';
import { isCourseUnlocked } from './academy-content.service.js';
import { QuizSummaryDto } from './dto/quiz-summary.dto.js';

/**
 * Liste des quiz d'un cours, pour que la page de cours puisse proposer de les
 * passer. Aucune réponse n'est exposée ici : seuls le titre, le seuil et le
 * nombre de questions. L'accès suit la même règle que le contenu du cours — un
 * cours verrouillé ne livre pas ses quiz.
 *
 * Service séparé du catalogue pour ne pas toucher au service de contenu déjà
 * livré : il lit les mêmes tables, en lecture seule.
 */
@Injectable()
export class AcademyQuizCatalogService {
  constructor(
    @InjectRepository(AcademyCourse)
    private readonly courses: Repository<AcademyCourse>,
    @InjectRepository(AcademyLesson)
    private readonly lessons: Repository<AcademyLesson>,
    @InjectRepository(AcademyQuiz)
    private readonly quizzes: Repository<AcademyQuiz>,
    @InjectRepository(AcademyQuizQuestion)
    private readonly questions: Repository<AcademyQuizQuestion>,
    @InjectRepository(AcademyUserUnlock)
    private readonly unlocks: Repository<AcademyUserUnlock>,
    private readonly access: AcademyAccessService,
  ) {}

  /** Quiz rattachés à un cours (directement ou via ses leçons). */
  async listCourseQuizzes(courseId: string, userId: string): Promise<QuizSummaryDto[]> {
    const course = await this.courses.findOne({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Cours introuvable.');

    const [unlockRows, currentLevel] = await Promise.all([
      this.unlocks.find({ where: { userId } }),
      this.access.getCurrentLevel(userId),
    ]);
    const unlocked = new Set(
      unlockRows.filter((row) => row.courseId).map((row) => row.courseId as string),
    );
    if (!isCourseUnlocked(course, unlocked) || !isLevelOpen(course.level, currentLevel)) {
      throw new ForbiddenException(
        course.unlockHint
          ? `Ce cours est verrouillé : ${course.unlockHint}`
          : 'Ce cours est verrouillé.',
      );
    }

    const lessons = await this.lessons.find({ where: { courseId } });
    const lessonIds = lessons.map((lesson) => lesson.id);
    const quizzes = await this.quizzes.find({
      where: lessonIds.length > 0 ? [{ courseId }, { lessonId: In(lessonIds) }] : [{ courseId }],
      order: { position: 'ASC', title: 'ASC' },
    });
    if (quizzes.length === 0) return [];

    const questions = await this.questions.find({
      where: { quizId: In(quizzes.map((quiz) => quiz.id)) },
    });
    const counts = new Map<string, number>();
    for (const question of questions) {
      counts.set(question.quizId, (counts.get(question.quizId) ?? 0) + 1);
    }

    return quizzes.map((quiz) =>
      plainToInstance(QuizSummaryDto, {
        id: quiz.id,
        code: quiz.code,
        title: quiz.title,
        lessonId: quiz.lessonId,
        passThreshold: Number(quiz.passThreshold),
        questionCount: counts.get(quiz.id) ?? 0,
      }),
    );
  }
}
