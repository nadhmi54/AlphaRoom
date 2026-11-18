/**
 * Correction d'un quiz, isolée en fonctions pures : ni base, ni réseau. Le
 * service ne fait que charger les questions et enregistrer le résultat ; toute
 * la logique de notation est ici, donc vérifiable à la main dans le spec.
 */

/** Question telle qu'elle est nécessaire à la correction (jamais exposée brute). */
export interface GradableQuestion {
  id: string;
  correctIndex: number;
  explanation: string | null;
}

/** Réponse envoyée par le navigateur : une question, un choix sélectionné. */
export interface SubmittedAnswer {
  questionId: string;
  selectedIndex: number;
}

export interface GradedAnswer {
  questionId: string;
  /** Choix de l'élève, `null` s'il n'a pas répondu à cette question. */
  selectedIndex: number | null;
  correctIndex: number;
  correct: boolean;
  explanation: string | null;
}

export interface QuizGrade {
  /** Pourcentage de bonnes réponses, arrondi au centième. */
  score: number;
  passed: boolean;
  correctCount: number;
  totalQuestions: number;
  answers: GradedAnswer[];
}

/** Arrondi au centième, sans bruit de virgule flottante. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Note une copie : le score est le pourcentage de bonnes réponses et la réussite
 * se mesure au seuil du quiz (`passThreshold`, 70 % par défaut).
 *
 * Une question sans réponse compte comme fausse. Une réponse portant sur une
 * question inconnue est ignorée (le navigateur ne peut pas gonfler son score en
 * inventant des identifiants). Un quiz sans question donne 0 et échoue : il ne
 * peut pas être « réussi » sans rien avoir répondu.
 */
export function gradeQuiz(
  questions: GradableQuestion[],
  answers: SubmittedAnswer[],
  passThreshold: number,
): QuizGrade {
  const answerByQuestion = new Map<string, number>();
  for (const answer of answers) {
    answerByQuestion.set(answer.questionId, answer.selectedIndex);
  }

  const graded: GradedAnswer[] = questions.map((question) => {
    const selected = answerByQuestion.get(question.id);
    const selectedIndex = selected === undefined ? null : selected;
    return {
      questionId: question.id,
      selectedIndex,
      correctIndex: question.correctIndex,
      correct: selectedIndex === question.correctIndex,
      explanation: question.explanation,
    };
  });

  const correctCount = graded.filter((answer) => answer.correct).length;
  const totalQuestions = questions.length;
  const score = totalQuestions === 0 ? 0 : round2((correctCount / totalQuestions) * 100);

  return {
    score,
    passed: totalQuestions > 0 && score >= passThreshold,
    correctCount,
    totalQuestions,
    answers: graded,
  };
}
