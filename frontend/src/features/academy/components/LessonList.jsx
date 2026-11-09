import { useState } from 'react';
import { lessonKindLabel } from '../lib/labels.js';

/**
 * Sommaire des leçons d'un cours débloqué. Chaque leçon peut être marquée
 * « en cours » ou « terminée » ; l'avancement est enregistré côté serveur
 * (`PUT /academy/lessons/:id/progress`).
 */
export default function LessonList({ lessons, onUpdateProgress, completedIds = [], busyLessonId }) {
  const [openId, setOpenId] = useState(null);

  if (!lessons.length) {
    return <p className="ar-ac-muted">Ce cours ne contient pas encore de leçon.</p>;
  }

  return (
    <ul className="ar-ac-lessons">
      {lessons.map((lesson, index) => {
        const done = completedIds.includes(lesson.id);
        const open = openId === lesson.id;
        const busy = busyLessonId === lesson.id;

        return (
          <li key={lesson.id} className="ar-ac-lesson">
            <span className="ar-ac-lesson__index" aria-hidden="true">
              {index + 1}
            </span>

            <div className="ar-ac-lesson__body">
              <p className="ar-ac-lesson__title">{lesson.title}</p>
              <p className="ar-ac-lesson__meta">
                {lessonKindLabel(lesson.kind)}
                {lesson.durationMinutes ? ` · ${lesson.durationMinutes} min` : ''}
                {done ? ' · terminée' : ''}
              </p>

              {open && lesson.content && (
                <div className="ar-ac-lesson__content">{lesson.content}</div>
              )}
              {open && lesson.videoUrl && (
                <a
                  className="ar-ac-lesson__link"
                  href={lesson.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ouvrir la ressource
                </a>
              )}
            </div>

            <div className="ar-ac-card__foot">
              {lesson.content || lesson.videoUrl ? (
                <button
                  type="button"
                  className="ar-ac-btn ar-ac-btn--ghost ar-ac-btn--sm"
                  onClick={() => setOpenId(open ? null : lesson.id)}
                >
                  {open ? 'Masquer' : 'Lire'}
                </button>
              ) : null}
              <button
                type="button"
                className="ar-ac-btn ar-ac-btn--sm"
                disabled={busy || done}
                onClick={() => onUpdateProgress(lesson, 'completed')}
              >
                {done ? 'Terminée' : busy ? 'Enregistrement…' : 'Marquer terminée'}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
