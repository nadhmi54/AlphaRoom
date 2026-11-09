import { useState } from 'react';

/**
 * Passage d'un quiz. Le client n'envoie que les choix de l'élève : la
 * correction, le score et le seuil de réussite sont calculés par le serveur.
 * `submit` reçoit la liste des réponses et renvoie le résultat corrigé.
 */
export default function QuizRunner({ quiz, submit, onExit }) {
  const [selections, setSelections] = useState({});
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const questions = quiz.questions ?? [];
  const answeredCount = questions.filter((question) => selections[question.id] !== undefined).length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  const select = (questionId, optionIndex) => {
    if (result) return;
    setSelections((previous) => ({ ...previous, [questionId]: optionIndex }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const answers = questions.map((question) => ({
        questionId: question.id,
        selectedIndex: selections[question.id],
      }));
      setResult(await submit(answers));
    } catch (submitError) {
      setError(submitError?.message || 'Impossible de soumettre le quiz.');
    } finally {
      setSubmitting(false);
    }
  };

  const gradedByQuestion = new Map(
    (result?.answers ?? []).map((answer) => [answer.questionId, answer]),
  );

  if (!questions.length) {
    return <p className="ar-ac-muted">Ce quiz ne contient pas encore de question.</p>;
  }

  return (
    <div className="ar-ac-quiz">
      <div className="ar-ac__section-head">
        <h2>{quiz.title}</h2>
        <p>
          Seuil de réussite : {quiz.passThreshold} % · {questions.length} question
          {questions.length > 1 ? 's' : ''}
        </p>
      </div>

      {questions.map((question, index) => {
        const graded = gradedByQuestion.get(question.id);
        const selected = selections[question.id];

        return (
          <section key={question.id} className="ar-ac-quiz__q">
            <p className="ar-ac-quiz__prompt">
              {index + 1}. {question.prompt}
            </p>
            <div className="ar-ac-quiz__options">
              {question.options.map((option, optionIndex) => {
                const isSelected = selected === optionIndex;
                let optionClass = 'ar-ac-quiz__option';
                if (graded) {
                  if (optionIndex === graded.correctIndex) optionClass += ' is-correct';
                  else if (isSelected) optionClass += ' is-wrong';
                } else if (isSelected) {
                  optionClass += ' is-selected';
                }

                return (
                  <label key={`${question.id}-${optionIndex}`} className={optionClass}>
                    <input
                      type="radio"
                      name={`question-${question.id}`}
                      value={optionIndex}
                      checked={isSelected}
                      disabled={Boolean(result)}
                      onChange={() => select(question.id, optionIndex)}
                    />
                    <span>{option}</span>
                  </label>
                );
              })}
            </div>
            {graded?.explanation && (
              <p className="ar-ac-quiz__explanation">{graded.explanation}</p>
            )}
          </section>
        );
      })}

      {error && (
        <div className="ar-ac__state is-error" role="alert">
          {error}
        </div>
      )}

      {result ? (
        <div className={`ar-ac-result ${result.passed ? 'is-passed' : 'is-failed'}`} role="status">
          <p className="ar-ac-result__score">{result.score} %</p>
          <p className="ar-ac-result__text">
            {result.passed ? 'Quiz réussi' : 'Quiz non réussi'} — {result.correctCount}/
            {result.totalQuestions} bonnes réponses (seuil {result.threshold} %).
          </p>
          <div className="ar-ac-result__actions">
            <button
              type="button"
              className="ar-ac-btn ar-ac-btn--ghost"
              onClick={() => {
                setResult(null);
                setSelections({});
              }}
            >
              Recommencer
            </button>
            {onExit && (
              <button type="button" className="ar-ac-btn" onClick={onExit}>
                Retour au cours
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="ar-ac-result__actions">
          <button
            type="button"
            className="ar-ac-btn"
            disabled={!allAnswered || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Correction…' : `Valider (${answeredCount}/${questions.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
