import { useEffect, useState } from 'react';
import PageShell from '../../components/PageShell/PageShell.jsx';
import { getAiUsage, listAiSessions } from '../../services/aiService.js';
import MarketTab from './MarketTab.jsx';
import ReplayTab from './ReplayTab.jsx';
import ReportsTab from './ReportsTab.jsx';
import { runLabel } from './aiLabels.js';
import './AiPages.css';

const TABS = [
  { id: 'reports', label: 'Bilans' },
  { id: 'market', label: 'Marché' },
  { id: 'replay', label: 'Replay' },
];

/**
 * Espace enseignant du module IA : préparer, relire, corriger et publier les
 * bilans ; lire le marché ; comparer deux passages. L'IA propose, l'enseignant décide.
 */
export default function TeacherAiPage() {
  const [sessions, setSessions] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [run, setRun] = useState(1);
  const [tab, setTab] = useState('reports');
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    let active = true;
    listAiSessions()
      .then((list) => {
        if (!active) return;
        setSessions(list);
        if (list.length > 0) {
          setSessionId(list[0].sessionId);
          setRun(list[0].latestRun);
        }
      })
      .catch((error) => {
        if (!active) return;
        setSessions([]);
        setLoadError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return undefined;
    let active = true;
    getAiUsage(sessionId)
      .then((result) => active && setUsage(result))
      .catch(() => active && setUsage(null));
    return () => {
      active = false;
    };
  }, [sessionId, tab]);

  const current = sessions?.find((s) => s.sessionId === sessionId);
  const runs = current?.runs ?? [run];

  function pickSession(id) {
    const next = sessions.find((s) => s.sessionId === id);
    setSessionId(id);
    if (next) setRun(next.latestRun);
  }

  return (
    <PageShell
      wide
      title="Espace enseignant — IA"
      subtitle="L’IA prépare, tu relis et tu décides : rien n’est publié sans ta validation."
    >
      {sessions === null && <p className="ai-muted">Chargement des séances…</p>}
      {loadError && (
        <div className="ar-ps__banner ar-ps__banner--error" role="alert">
          {loadError}
          <br />
          <span className="ai-muted">
            En local, démarre le backend avec <code>AI_SESSION_SOURCE=demo</code> pour utiliser la séance fictive.
          </span>
        </div>
      )}

      {sessions !== null && (
        <>
          <div className="ai-picker">
            {sessions.length > 0 ? (
              <>
                <label>
                  Séance
                  <select className="ar-ps__input" value={sessionId} onChange={(e) => pickSession(e.target.value)}>
                    {sessions.map((s) => (
                      <option key={s.sessionId} value={s.sessionId}>{s.title}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Passage
                  <select className="ar-ps__input" value={run} onChange={(e) => setRun(Number(e.target.value))}>
                    {runs.map((r) => (
                      <option key={r} value={r}>{runLabel(r)}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              !loadError && (
                <>
                  <label>
                    Identifiant de la séance
                    <input className="ar-ps__input" value={sessionId} onChange={(e) => setSessionId(e.target.value.trim())} />
                  </label>
                  <label>
                    Passage
                    <input
                      className="ar-ps__input"
                      type="number"
                      min="1"
                      value={run}
                      onChange={(e) => setRun(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </label>
                </>
              )
            )}
            {usage && (
              <p className="ai-usage" title="Appels au modèle de langage pour cette séance">
                Consommation IA : {usage.calls} appel{usage.calls > 1 ? 's' : ''} · {usage.inputTokens} + {usage.outputTokens} tokens
              </p>
            )}
          </div>

          {sessionId && (
            <>
              <div className="ai-tabs" role="tablist" aria-label="Sections IA">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === item.id}
                    className={tab === item.id ? 'is-active' : ''}
                    onClick={() => setTab(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div role="tabpanel">
                {tab === 'reports' && <ReportsTab sessionId={sessionId} run={run} />}
                {tab === 'market' && <MarketTab key={`${sessionId}-${run}`} sessionId={sessionId} run={run} />}
                {tab === 'replay' && <ReplayTab sessionId={sessionId} runs={runs} />}
              </div>
            </>
          )}
        </>
      )}
    </PageShell>
  );
}
