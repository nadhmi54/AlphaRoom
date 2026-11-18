import { Expose } from 'class-transformer';

/**
 * Quiz proposé dans le détail d'un cours : seulement de quoi l'annoncer et
 * l'ouvrir. Les questions et les bonnes réponses restent côté serveur et ne
 * sont servies qu'au passage du quiz (`GET /academy/quizzes/:id`).
 */
export class QuizSummaryDto {
  @Expose() id!: string;
  @Expose() code!: string | null;
  @Expose() title!: string;
  @Expose() lessonId!: string | null;
  @Expose() passThreshold!: number;
  @Expose() questionCount!: number;
}
