import { useState } from 'react';
import EvidenceChips from './EvidenceChips.jsx';
import { percent, signedPercent } from './aiLabels.js';
import { analyzeMarket } from '../../services/aiService.js';

const fmt = (value) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);

export function Commentary({ result }) {
  return (
    <section className="ai-block ai-commentary">
      <h3>Commentaire de l’IA</h3>
      {result.commentary ? (
        <>
          <p>{result.commentary}</p>
          <p className="ai-muted">Rédigé par l’IA à partir des chiffres ci-dessus ; chaque chiffre cité a été vérifié par le code.</p>
        </>
      ) : (
        <p className="ai-muted">{result.commentaryNote ?? 'Aucun commentaire de l’IA : les constats ci-dessus sont calculés par le code.'}</p>
      )}
    </section>
  );
}

/** Market Analyst : lecture du marché de la séance (prix, chocs, réactions du groupe). */
export default function MarketTab({ sessionId, run }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function analyze() {
    setBusy(true);
    setError('');
    try {
      setResult(await analyzeMarket(sessionId, run));
    } catch (e) {
      setResult(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const analysis = result?.analysis;
  return (
    <div>
      <div className="ai-toolbar">
        <p className="ai-muted">Résume ce qui s’est passé sur le marché pendant ce passage et comment le groupe a réagi aux événements.</p>
        <button type="button" className="ar-ps__btn ar-ps__btn--primary" disabled={busy} onClick={analyze}>
          {busy ? 'Analyse…' : 'Analyser le marché'}
        </button>
      </div>
      {error && <div className="ar-ps__banner ar-ps__banner--error" role="alert">{error}</div>}

      {analysis && (
        <>
          <section className="ai-block">
            <h3>Constats</h3>
            <ul className="ai-points">
              {analysis.highlights.map((highlight, index) => (
                <li key={index}>
                  <p>{highlight.text}</p>
                  <EvidenceChips evidence={highlight.evidence} />
                </li>
              ))}
            </ul>
          </section>

          <section className="ai-block">
            <h3>Actifs</h3>
            <div className="ai-tablewrap">
              <table className="ai-table">
                <thead>
                  <tr>
                    <th>Actif</th>
                    <th>Début</th>
                    <th>Fin</th>
                    <th>Variation</th>
                    <th>Plus bas</th>
                    <th>Plus haut</th>
                    <th>Volatilité / min</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.symbols.map((s) => (
                    <tr key={s.symbol}>
                      <td><strong>{s.symbol}</strong></td>
                      <td>{fmt(s.first)}</td>
                      <td>{fmt(s.last)}</td>
                      <td>{signedPercent(s.changeRate)}</td>
                      <td>{fmt(s.min)} (min {s.minMinute})</td>
                      <td>{fmt(s.max)} (min {s.maxMinute})</td>
                      <td>{percent(s.volatility, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {analysis.events.length > 0 && (
            <section className="ai-block">
              <h3>Événements</h3>
              <ul className="ai-points">
                {analysis.events.map((event) => (
                  <li key={event.id}>
                    <p>
                      <strong>Minute {event.minute}</strong> · {event.type} · « {event.label} »
                    </p>
                    <p className="ai-muted">
                      {event.impacts.map((i) => `${i.symbol} ${fmt(i.before)} → ${fmt(i.after)} (${signedPercent(i.moveRate)})`).join(' ; ')}{' '}
                      — {event.reacted} / {event.participants} participants ont réagi.
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Commentary result={result} />
        </>
      )}
    </div>
  );
}
