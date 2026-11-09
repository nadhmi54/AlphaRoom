import { Link } from 'react-router-dom';

const DEFAULT_HINT = 'Réussis les cours et missions du niveau précédent pour le débloquer.';

/**
 * Carte d'un cours dans le catalogue. Un cours verrouillé reste visible avec sa
 * condition de déblocage ; seul le contenu est inaccessible (le serveur refuse
 * aussi le détail, la restriction n'est pas qu'un masquage visuel).
 */
export default function CourseCard({ course }) {
  const locked = !course.unlocked;

  return (
    <article className={`ar-ac-card${locked ? ' is-locked' : ''}`}>
      <div className="ar-ac-card__top">
        <span className="ar-ac-card__level">
          Niveau {course.level}
          {course.isPremium ? ' · Avancé' : ''}
        </span>
        {locked ? (
          <span className="ar-ac-card__lock">Verrouillé</span>
        ) : (
          <span className="ar-ac-chip is-open">Débloqué</span>
        )}
      </div>

      <h3 className="ar-ac-card__title">{course.title}</h3>

      {course.summary && <p className="ar-ac-card__summary">{course.summary}</p>}

      {locked && (
        <p className="ar-ac-card__hint">Condition : {course.unlockHint || DEFAULT_HINT}</p>
      )}

      <div className="ar-ac-card__foot">
        {locked ? (
          <span className="ar-ac-muted">À débloquer</span>
        ) : (
          <Link className="ar-ac-btn ar-ac-btn--sm" to={`/academy/cours/${course.id}`}>
            Ouvrir le cours
          </Link>
        )}
      </div>
    </article>
  );
}
