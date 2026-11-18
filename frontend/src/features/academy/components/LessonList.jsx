import { useState } from 'react';
import { lessonKindLabel } from '../lib/labels.js';

/**
 * Convertit une URL YouTube (watch, embed, youtu.be) en URL d'intégration.
 * Renvoie null si l'URL n'est pas une URL YouTube reconnaissable.
 */
function toYouTubeEmbed(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') {
        const id = u.searchParams.get('v');
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (u.pathname.startsWith('/embed/')) return url;
    }
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
  } catch {
    return null;
  }
  return url;
}

/**
 * Sommaire des leçons d'un cours débloqué. Chaque leçon peut être marquée
 * « en cours » ou « terminée » ; l'avancement est enregistré côté serveur
 * (`PUT /academy/lessons/:id/progress`).
 *
 * Les leçons vidéo sont lues directement dans la page via un lecteur YouTube
 * intégré : l'élève n'a pas à quitter l'application pour suivre le cours.
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
        const embedUrl = toYouTubeEmbed(lesson.videoUrl);

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

              {open && embedUrl && (
                <div className="ar-ac-lesson__video" style={{ marginTop: 12 }}>
                  <iframe
                    src={embedUrl}
                    title={lesson.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{
                      width: '100%',
                      aspectRatio: '16 / 9',
                      border: 'none',
                      borderRadius: 8,
                    }}
                  />
                </div>
              )}

              {open && lesson.videoUrl && !embedUrl && (
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
