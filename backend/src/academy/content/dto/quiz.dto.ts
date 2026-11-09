import { Expose, Type } from 'class-transformer';
import { IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

/**
 * Question d'un quiz telle qu'elle est servie à l'élève : les options, jamais
 * l'indice de la bonne réponse ni l'explication (révélés seulement après
 * correction, dans le résultat de soumission).
 */
export class QuizQuestionDto {
  @Expose() id!: string;
  @Expose() position!: number;
  @Expose() prompt!: string;
  @Expose() options!: string[];
}

/** Quiz servi pour passage : les réponses restent côté serveur. */
export class QuizDto {
  @Expose() id!: string;
  @Expose() code!: string | null;
  @Expose() title!: string;
  @Expose() courseId!: string | null;
  @Expose() lessonId!: string | null;
  @Expose() passThreshold!: number;

  @Expose()
  @Type(() => QuizQuestionDto)
  questions!: QuizQuestionDto[];
}

/** Une réponse à une question du quiz. */
export class QuizAnswerDto {
  @IsUUID('4', { message: 'Identifiant de question invalide.' })
  questionId!: string;

  @IsInt({ message: "L'indice de choix doit être un entier." })
  @Min(0, { message: "L'indice de choix ne peut pas être négatif." })
  selectedIndex!: number;
}

/** Copie soumise par l'élève. */
export class SubmitQuizDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerDto)
  answers!: QuizAnswerDto[];
}

/** Correction d'une question, renvoyée après soumission. */
export class GradedAnswerDto {
  @Expose() questionId!: string;
  @Expose() selectedIndex!: number | null;
  @Expose() correctIndex!: number;
  @Expose() correct!: boolean;
  @Expose() explanation!: string | null;
}

/** Résultat d'une soumission, calculé côté serveur. */
export class QuizResultDto {
  @Expose() quizId!: string;
  @Expose() score!: number;
  @Expose() passed!: boolean;
  @Expose() correctCount!: number;
  @Expose() totalQuestions!: number;
  @Expose() threshold!: number;

  @Expose()
  @Type(() => GradedAnswerDto)
  answers!: GradedAnswerDto[];
}
