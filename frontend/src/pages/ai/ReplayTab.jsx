import { useEffect, useState } from 'react';
import { Commentary } from './MarketTab.jsx';
import { VERDICT_LABELS, formatScore, percent, runLabel } from './aiLabels.js';
import { analyzeReplay } from '../../services/aiService.js';

const VERDICT_CLASS = { improved: 'ai-chip--ok', worsened: 'ai-chip--bad', unchanged: '', not_comparable: '' };

/** Replay Analyzer : compare deux passages d'une même séance (avant / après un rollback). */
export default function ReplayTab({ sessionId, runs }) {
  const [fromRun, setFromRun] = useState(runs[0] ?? 1);
  const [toRun, setToRun] = useState(runs.at(-1) ?? 1);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setFromRun(runs[0] ?? 1);
    setToRun(runs.at(-1) ?? 1);
    setResult(null);
    setError('');
  }, [sessionId, runs]);

  async function compare() {
    setBusy(true);
    setError('');
    try {
      setResult(await analyzeReplay(sessionId, fromRun, toRun));
    } catch (e) {
      setResult(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const analysis = result?.analysis;
  const canCompare = runs.length >= 2 && fromRun < toRun;

  return (
    <div>
      <div className="ai-toolbar">
        <p className="ai-muted">
          Après un rollback, compare ce que chaque étudiant a fait la première fois et la seconde fois sur la même situation de marché.
        </p>
        <div className="ai-toolbar__controls">
          <label>
            De
            <select className="ar-ps__input" value={fromRun} onChange={(e) => setFromRun(Number(e.target.value))}>
              {runs.map((run) => (
                <option key={run} value={run}>{runLabel(run)}</option>
              ))}
            </select>
          </label>
          <label>
            à
            <select className="ar-ps__input" value={toRun} onChange={(e) => setToRun(Number(e.target.value))}>
              {runs.map((run) => (
                <option key={run} value={run}>{runLabel(run)}</option>
              ))}
            </select>
          </label>
          <button type="button" className="ar-ps__btn ar-ps__btn--primary" disabled={busy || !canCompare} onClick={compare}>
            {busy ? 'Comparaison…' : 'Comparer'}
          </button>
        </div>
      </div>
      {runs.length < 2 && <p className="ai-muted">Cette séance n’a qu’un seul passage : il faut un rollback pour pouvoir comparer.</p>}
      {error && <div className="ar-ps__banner ar-ps__banner--error" role="alert">{error}</div>}

      {analysis && (
        <>
          <p className="ai-headline">{analysis.headline}</p>
          <div className="ai-tablewrap">
            <table className="ai-table">
              <thead>
                <tr>
                  <th>Étudiant</th>
                  <th>Note avant → après</th>
                  <th>Exposition max</th>
                  <th>Bilan</th>
                  <th>Ce qui a changé</th>
                </tr>
              </thead>
              <tbody>
                {analysis.participants.map((p) => (
                  <tr key={p.participantId}>
                    <td>
                      <strong>{p.displayName}</strong>
                      <span className="ai-sub">{p.alias}</span>
                    </td>
                    <td>{formatScore(p.before.overallScore)} → {formatScore(p.after.overallScore)}</td>
                    <td>{percent(p.before.maxExposure)} → {percent(p.after.maxExposure)}</td>
                    <td><span className={`ai-chip ${VERDICT_CLASS[p.verdict]}`}>{VERDICT_LABELS[p.verdict]}</span></td>
                    <td>
                      <ul className="ai-changes">
                        {p.changes.map((change, index) => (
                          <li key={index}>{change}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {analysis.notComparable > 0 && (
            <p className="ai-muted">{analysis.notComparable} participant(s) absent(s) d’un des deux passages, non comparés.</p>
          )}
          <Commentary result={result} />
        </>
      )}
    </div>
  );
}
