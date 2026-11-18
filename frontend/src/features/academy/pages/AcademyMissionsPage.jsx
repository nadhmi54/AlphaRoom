import AcademyShell from '../components/AcademyShell.jsx';
import AcademyState from '../components/AcademyState.jsx';
import { useAcademyMissions } from '../hooks/useAcademy.js';
import { describeCriteria, describeWindow, missionStateLabel } from '../lib/labels.js';

// Missions et défis : critères visibles, fenêtre de validité et état dans le
// parcours. L'état (`locked`, `available`, `passed`) est calculé côté serveur à
// partir des cours validés et des résultats de parties : une mission verrouillée
// affiche la condition exacte à remplir. Aucune réussite n'est décidée ici.
const STATE_CLASS = {
  locked: 'is-closed',
  available: 'is-open',
  passed: 'is-open',
};

export default function AcademyMissionsPage() {
  const { data, loading, error, reload } = useAcademyMissions();
  const missions = data ?? [];

  return (
    <AcademyShell>
      <AcademyState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={!missions.length}
        emptyText="Aucune mission n’est disponible pour l’instant."
      >
        <section className="ar-ac__section">
          <div className="ar-ac__section-head">
            <h2>Missions &amp; défis</h2>
            <p>Réussis les critères lors d’une partie pour valider la mission.</p>
          </div>

          <div className="ar-ac__grid">
            {missions.map((mission) => {
              const criteria = describeCriteria(mission.criteria);
              return (
                <article key={mission.id} className="ar-ac-mission">
                  <div className="ar-ac-mission__top">
                    <h3 className="ar-ac-mission__title">{mission.title}</h3>
                    <div className="ar-ac-card__top" style={{ gap: 8 }}>
                      {mission.isPlacement && <span className="ar-ac-chip is-soft">Placement</span>}
                      <span className={`ar-ac-chip ${STATE_CLASS[mission.state] ?? 'is-closed'}`}>
                        {missionStateLabel(mission.state)}
                      </span>
                      {!mission.open && <span className="ar-ac-chip is-closed">Hors période</span>}
                    </div>
                  </div>

                  <p className="ar-ac-card__level">Niveau {mission.level}</p>
                  {mission.description && (
                    <p className="ar-ac-card__summary">{mission.description}</p>
                  )}

                  {mission.unlockCondition && (
                    <p className="ar-ac-card__hint">{mission.unlockCondition}</p>
                  )}

                  {criteria.length > 0 && (
                    <ul className="ar-ac-criteria">
                      {criteria.map((item) => (
                        <li key={item.key}>
                          <span>{item.label}</span>
                          <b>{item.value}</b>
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="ar-ac-muted">{describeWindow(mission.startsAt, mission.endsAt)}</p>
                </article>
              );
            })}
          </div>
        </section>
      </AcademyState>
    </AcademyShell>
  );
}
