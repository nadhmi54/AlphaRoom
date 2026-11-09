import { badgeIcon, missionStateLabel } from '../lib/labels.js';

// État d'une mission, du point de vue visuel (verrouillée = grise, ouverte = verte).
const STATE_CLASS = {
  locked: 'is-closed',
  available: 'is-open',
  passed: 'is-open',
};

/**
 * Parcours par niveau : pour chaque palier, l'avancement en cours validés, le
 * badge de niveau (obtenu ou à débloquer) et la mission du niveau (verrouillée,
 * disponible ou réussie). Tout est calculé par le serveur ; cette vue ne fait
 * que le rendre. Une mission réussie affiche « Niveau suivant débloqué ».
 */
export default function LevelJourney({ levels }) {
  if (!levels.length) {
    return <p className="ar-ac-muted">Aucun niveau à afficher pour l’instant.</p>;
  }

  return (
    <div className="ar-ac-levels">
      {levels.map((level) => {
        const { badge, mission } = level;
        return (
          <article key={level.level} className={`ar-ac-level${level.open ? '' : ' is-locked'}`}>
            <div className="ar-ac-level__head">
              <h3>Niveau {level.level}</h3>
              <span className={`ar-ac-chip ${level.open ? 'is-open' : 'is-closed'}`}>
                {level.open ? 'Ouvert' : 'Verrouillé'}
              </span>
            </div>

            <p className="ar-ac-level__count">
              {level.coursesValidated}/{level.coursesTotal} cours validé
              {level.coursesTotal > 1 ? 's' : ''}
            </p>

            {level.courses.length > 0 && (
              <ul className="ar-ac-level__courses">
                {level.courses.map((course) => (
                  <li key={course.id} className={course.validated ? 'is-done' : undefined}>
                    <span aria-hidden="true">{course.validated ? '✓' : '○'}</span> {course.title}
                  </li>
                ))}
              </ul>
            )}

            {badge && (
              <div className={`ar-ac-level__badge${badge.awarded ? ' is-owned' : ''}`}>
                <span className="ar-ac-badge__icon" aria-hidden="true">
                  {badgeIcon(badge.icon)}
                </span>
                <span>
                  {badge.title} — {badge.awarded ? 'obtenu' : 'à débloquer'}
                </span>
              </div>
            )}

            {mission ? (
              <div className={`ar-ac-level__mission is-${mission.state}`}>
                <div className="ar-ac-mission__top">
                  <b>Mission du niveau</b>
                  <span className={`ar-ac-chip ${STATE_CLASS[mission.state] ?? 'is-closed'}`}>
                    {missionStateLabel(mission.state)}
                  </span>
                </div>
                <p className="ar-ac-level__mission-title">{mission.title}</p>
                {mission.unlockCondition && (
                  <p className="ar-ac-muted">{mission.unlockCondition}</p>
                )}
                {mission.state === 'passed' && (
                  <p className="ar-ac-level__unlocked">Niveau suivant débloqué</p>
                )}
              </div>
            ) : (
              <p className="ar-ac-muted">Aucune mission pour ce niveau.</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
