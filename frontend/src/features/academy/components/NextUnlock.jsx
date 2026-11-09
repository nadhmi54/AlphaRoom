const DEFAULT_HINT = 'Continue ta progression pour le débloquer.';

/**
 * Bloc « prochain déblocage » : le prochain cours verrouillé et la condition
 * exacte à remplir. Alimenté par le catalogue (qui contient aussi les cours
 * verrouillés, avec leur `unlockHint`).
 */
export default function NextUnlock({ course }) {
  if (!course) {
    return (
      <div className="ar-ac-next">
        <span className="ar-ac-next__icon" aria-hidden="true">
          ✓
        </span>
        <div>
          <p className="ar-ac-next__title">Aucun déblocage en attente</p>
          <p className="ar-ac-next__text">
            Tous les cours disponibles sont débloqués. De nouveaux contenus
            apparaîtront au fil des niveaux.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ar-ac-next">
      <span className="ar-ac-next__icon" aria-hidden="true">
        →
      </span>
      <div>
        <p className="ar-ac-next__title">Prochain déblocage : {course.title}</p>
        <p className="ar-ac-next__text">
          Niveau {course.level} — {course.unlockHint || DEFAULT_HINT}
        </p>
      </div>
    </div>
  );
}
