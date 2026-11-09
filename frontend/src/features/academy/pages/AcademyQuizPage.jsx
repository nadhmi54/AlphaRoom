import { useNavigate, useParams } from 'react-router-dom';
import AcademyShell from '../components/AcademyShell.jsx';
import AcademyState from '../components/AcademyState.jsx';
import QuizRunner from '../components/QuizRunner.jsx';
import { useQuiz } from '../hooks/useAcademy.js';
import { submitQuiz } from '../api/academyApi.js';

// Passage d'un quiz. Le serveur ne renvoie les questions qu'à l'ouverture et ne
// corrige qu'à la soumission : le client n'envoie que les choix de l'élève.
export default function AcademyQuizPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: quiz, loading, error, reload } = useQuiz(id);

  const handleSubmit = (answers) => submitQuiz(id, answers);

  const exit = () => {
    if (quiz?.courseId) navigate(`/academy/cours/${quiz.courseId}`);
    else navigate('/academy');
  };

  return (
    <AcademyShell title={quiz?.title || 'Quiz'} subtitle="Réponds à toutes les questions, puis valide.">
      <AcademyState loading={loading} error={error} onRetry={reload}>
        {quiz && <QuizRunner quiz={quiz} submit={handleSubmit} onExit={exit} />}
      </AcademyState>
    </AcademyShell>
  );
}
