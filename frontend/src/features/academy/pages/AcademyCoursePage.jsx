import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AcademyShell from '../components/AcademyShell.jsx';
import AcademyState from '../components/AcademyState.jsx';
import LessonList from '../components/LessonList.jsx';
import { useCourse, useCourseQuizzes } from '../hooks/useAcademy.js';
import { drawCourseQuiz, updateLessonProgress } from '../api/academyApi.js';

// Page d'un cours débloqué : sommaire des leçons (avec enregistrement de
// l'avancement) et passage d'un quiz. Le quiz n'est pas choisi par le joueur :
// le serveur en tire un au hasard (en évitant le dernier tenté). Un cours
// verrouillé est refusé par le serveur : l'erreur remonte telle quelle.
export default function AcademyCoursePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: course, loading, error, reload } = useCourse(id);
  const { data: quizzes, loading: quizzesLoading, error: quizzesError } = useCourseQuizzes(id);

  const [busyLessonId, setBusyLessonId] = useState(null);
  const [completedIds, setCompletedIds] = useState([]);
  const [actionError, setActionError] = useState('');
  const [drawingQuiz, setDrawingQuiz] = useState(false);

  const handleUpdateProgress = async (lesson, status) => {
    setBusyLessonId(lesson.id);
    setActionError('');
    try {
      await updateLessonProgress(lesson.id, { status });
      setCompletedIds((ids) => (ids.includes(lesson.id) ? ids : [...ids, lesson.id]));
    } catch (updateError) {
      setActionError(updateError?.message || 'Impossible d’enregistrer ta progression.');
    } finally {
      setBusyLessonId(null);
    }
  };

  const handleStartQuiz = async () => {
    setDrawingQuiz(true);
    setActionError('');
    try {
      const quiz = await drawCourseQuiz(id);
      navigate(`/academy/quiz/${quiz.id}`);
    } catch (drawError) {
      setActionError(drawError?.message || 'Impossible de lancer un quiz pour ce cours.');
    } finally {
      setDrawingQuiz(false);
    }
  };

  const quizCount = quizzes?.length ?? 0;

  return (
    <AcademyShell title={course?.title || 'Cours'} subtitle={course?.summary || undefined}>
      <p className="ar-ac-muted" style={{ marginBottom: 18 }}>
        <Link className="ar-ac-lesson__link" to="/academy">
          ← Retour au catalogue
        </Link>
      </p>

      <AcademyState loading={loading} error={error} onRetry={reload}>
        <div className="ar-ac-course">
          <section className="ar-ac-panel">
            <h2>Leçons</h2>
            {actionError && (
              <div className="ar-ac__state is-error" role="alert" style={{ marginBottom: 14 }}>
                {actionError}
              </div>
            )}
            <LessonList
              lessons={course?.lessons ?? []}
              completedIds={completedIds}
              busyLessonId={busyLessonId}
              onUpdateProgress={handleUpdateProgress}
            />
          </section>

          <aside className="ar-ac-panel">
            <h2>Quiz du cours</h2>
            {quizzesLoading && <p className="ar-ac-muted">Chargement…</p>}
            {quizzesError && <p className="ar-ac-muted">{quizzesError}</p>}
            {!quizzesLoading && !quizzesError && quizCount === 0 && (
              <p className="ar-ac-muted">Aucun quiz n’est rattaché à ce cours.</p>
            )}
            {quizCount > 0 && (
              <>
                <p className="ar-ac-muted">
                  {quizCount} quiz disponible{quizCount > 1 ? 's' : ''} : le serveur t’en tire un au
                  hasard (jamais celui que tu viens de passer).
                </p>
                <button
                  type="button"
                  className="ar-ac-btn"
                  disabled={drawingQuiz}
                  onClick={handleStartQuiz}
                >
                  {drawingQuiz ? 'Tirage…' : 'Passer le quiz'}
                </button>
              </>
            )}
          </aside>
        </div>
      </AcademyState>
    </AcademyShell>
  );
}
