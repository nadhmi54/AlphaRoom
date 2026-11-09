import { badgeIcon, badgeKindLabel, formatDate } from '../lib/labels.js';

/**
 * Grille des badges : catalogue complet, les badges obtenus étant mis en
 * avant avec leur date d'obtention. L'attribution est faite par le moteur de
 * règles côté serveur, cette vue ne fait que relire.
 */
export default function BadgeGrid({ badges }) {
  if (!badges.length) {
    return <p className="ar-ac-muted">Aucun badge au catalogue pour l’instant.</p>;
  }

  return (
    <div className="ar-ac-badges">
      {badges.map((badge) => (
        <article
          key={badge.id}
          className={`ar-ac-badge${badge.owned ? ' is-owned' : ' is-locked'}`}
        >
          <span className="ar-ac-badge__icon" aria-hidden="true">
            {badgeIcon(badge.icon)}
          </span>
          <div className="ar-ac-card__top">
            <span className="ar-ac-card__level">{badgeKindLabel(badge.kind)}</span>
            {badge.owned && <span className="ar-ac-chip is-open">Obtenu</span>}
          </div>
          <h3 className="ar-ac-badge__title">{badge.title}</h3>
          {badge.description && <p className="ar-ac-badge__desc">{badge.description}</p>}
          {badge.owned && badge.awardedAt && (
            <p className="ar-ac-badge__date">Obtenu le {formatDate(badge.awardedAt)}</p>
          )}
        </article>
      ))}
    </div>
  );
}
