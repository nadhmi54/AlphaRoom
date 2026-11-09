import AcademyShell from '../components/AcademyShell.jsx';
import AcademyState from '../components/AcademyState.jsx';
import BadgeGrid from '../components/BadgeGrid.jsx';
import { useAcademyBadges } from '../hooks/useAcademy.js';

// Badges au profil : catalogue complet, avec mise en avant des badges obtenus.
// Le regroupement des deux listes se fait ici, le catalogue servant de
// référence pour l'ordre d'affichage.
export default function AcademyBadgesPage() {
  const { catalog, mine, loading, error, reload } = useAcademyBadges();

  const ownedById = new Map((mine ?? []).map((badge) => [badge.id, badge]));
  const badges = (catalog ?? []).map((badge) => ({
    ...badge,
    owned: ownedById.has(badge.id),
    awardedAt: ownedById.get(badge.id)?.awardedAt ?? null,
  }));

  const ownedCount = badges.filter((badge) => badge.owned).length;

  return (
    <AcademyShell>
      <AcademyState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={!badges.length}
        emptyText="Aucun badge n’est encore disponible."
      >
        <section className="ar-ac__section">
          <div className="ar-ac__section-head">
            <h2>Badges</h2>
            <p>
              {ownedCount} badge{ownedCount > 1 ? 's' : ''} obtenu{ownedCount > 1 ? 's' : ''} sur{' '}
              {badges.length}
            </p>
          </div>
          <BadgeGrid badges={badges} />
        </section>
      </AcademyState>
    </AcademyShell>
  );
}
