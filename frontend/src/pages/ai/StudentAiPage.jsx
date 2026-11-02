import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageShell from '../../components/PageShell/PageShell.jsx';
import CoachWidget from '../../components/CoachWidget/CoachWidget.jsx';
import { listAiSessions, listReports } from '../../services/aiService.js';
import ReportView from './ReportView.jsx';
import { formatDateTime, formatScore, runLabel } from './aiLabels.js';
import './AiPages.css';

/**
 * Espace étudiant : les bilans publiés par l'enseignant, avec la règle et les
 * preuves derrière chaque note (« Pourquoi cette note ? »).
 */
export default function StudentAiPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const sessions = await listAiSessions();
        const found = [];
        for (const session of sessions) {
          for (const run of session.runs) {
            const reports = await listReports(session.sessionId, run);
            for (const report of reports) found.push({ session, report });
          }
        }
        if (!active) return;
        setItems(found);
        if (found.length > 0) setSelectedId(found.at(-1).report.id);
      } catch (e) {
        if (!active) return;
        setItems([]);
        setError(e.message);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const selected = items?.find((item) => item.report.id === selectedId);

  return (
    <PageShell wide title="Mes bilans de séance" subtitle="Chaque note s’explique : la règle appliquée et les preuves sont écrites sous chaque critère.">
      {items === null && <p className="ai-muted">Chargement…</p>}
      {error && <div className="ar-ps__banner ar-ps__banner--error" role="alert">{error}</div>}

      {items !== null && items.length === 0 && !error && (
        <div className="ai-empty-card">
          <h2>Aucun bilan publié pour l’instant</h2>
          <p className="ai-muted">
            Ton enseignant relit et valide chaque bilan avant de te le montrer. Reviens après le débriefing de la séance.
            En attendant, le coach peut t’expliquer tes chiffres.
          </p>
          <Link to="/marche" className="ar-ps__btn">Retour au marché</Link>
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div className="ai-student">
          <nav className="ai-student__list" aria-label="Mes bilans">
            {items.map(({ session, report }) => (
              <button
                key={report.id}
                type="button"
                className={report.id === selectedId ? 'is-active' : ''}
                onClick={() => setSelectedId(report.id)}
              >
                <strong>{session.title}</strong>
                <span>{runLabel(report.run)} · note {formatScore(report.content.overall.score)} / {report.content.overall.outOf}</span>
                <span className="ai-sub">Validé le {formatDateTime(report.validatedAt)}</span>
              </button>
            ))}
          </nav>
          {selected && <ReportView report={selected.report} />}
        </div>
      )}
      <CoachWidget />
    </PageShell>
  );
}
