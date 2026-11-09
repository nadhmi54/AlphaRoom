import { Link } from 'react-router-dom';

/**
 * Notification « Cours débloqué » avec bouton d'ouverture. Affichée quand un
 * cours passe de verrouillé à débloqué entre deux chargements du catalogue.
 */
export default function UnlockNotice({ course, onDismiss }) {
  if (!course) return null;

  return (
    <div className="ar-ac-unlock" role="status">
      <p className="ar-ac-unlock__eyebrow">Cours débloqué</p>
      <h2 className="ar-ac-unlock__title">{course.title}</h2>
      <p className="ar-ac-unlock__text">
        Bravo, tu as rempli la condition de déblocage. Le cours est maintenant
        accessible.
      </p>
      <div className="ar-ac-unlock__actions">
        <Link className="ar-ac-btn ar-ac-btn--sm" to={`/academy/cours/${course.id}`}>
          Ouvrir le cours
        </Link>
        <button type="button" className="ar-ac-btn ar-ac-btn--ghost ar-ac-btn--sm" onClick={onDismiss}>
          Plus tard
        </button>
      </div>
    </div>
  );
}
