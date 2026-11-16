import { useEffect, useState } from 'react';
import { getReportHistory } from '../../services/aiService.js';
import { describeChange, formatDateTime, revisionLabel } from './aiLabels.js';

/**
 * Historique d'un bilan : qui a fait quoi et quand. Chargé à l'ouverture, et
 * rechargé quand le bilan change (`version`), pour montrer la dernière correction.
 */
export default function ReportHistory({ reportId, version }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ key: null, revisions: [], error: '' });
  const key = `${reportId}:${version}`;

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    (async () => {
      try {
        const data = await getReportHistory(reportId);
        if (active) setState({ key, revisions: data?.revisions ?? [], error: '' });
      } catch (error) {
        if (active) setState({ key, revisions: [], error: error.message });
      }
    })();
    return () => {
      active = false;
    };
  }, [open, reportId, key]);

  const loaded = state.key === key;

  return (
    <details className="ai-trace ai-history" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Historique des corrections</summary>
      {open && !loaded && <p className="ai-muted">Chargement…</p>}
      {loaded && state.error && <p className="ar-ps__error">{state.error}</p>}
      {loaded && !state.error && state.revisions.length === 0 && <p className="ai-muted">Aucune modification enregistrée.</p>}
      {loaded && state.revisions.length > 0 && (
        <ol className="ai-timeline">
          {state.revisions.map((revision) => (
            <li key={revision.id}>
              <div className="ai-timeline__head">
                <strong>{revisionLabel(revision.kind)}</strong>
                <span className="ai-sub">
                  {formatDateTime(revision.at)} · {revision.byYou ? 'toi' : 'un autre enseignant'}
                </span>
              </div>
              {revision.changes.length > 0 && (
                <ul>
                  {revision.changes.map((change, index) => (
                    <li key={index}>{describeChange(change)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
