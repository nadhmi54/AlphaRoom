import { useCallback, useEffect, useState } from 'react';
import { getLiveClass } from '../../services/aiService.js';
import './LiveClassPanel.css';

const POLL_MS = 10000;
const STATUS_LABELS = { ok: 'RAS', watch: 'À surveiller', alert: 'À aider' };
const NEWS_LABELS = { none: '—', pending: 'Pas encore', reacted: 'Oui' };

const money = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(Math.round(value)).toLocaleString('fr-FR')} $`;

/**
 * Suivi en direct de la classe, pour l'enseignant : qui a besoin d'aide, tout
 * de suite. Les constats viennent de règles testées côté serveur (aucun
 * modèle de langage ici) et se rafraîchissent toutes les 10 secondes.
 */
export default function LiveClassPanel({ roomId }) {
  const [open, setOpen] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!roomId) return;
    try {
      setData(await getLiveClass({ sessionId: roomId }));
      setError('');
    } catch (e) {
      setError(e.message || 'Suivi indisponible.');
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !open) return undefined;
    load();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [roomId, open, load]);

  const rows = data?.rows ?? [];
  const needHelp = rows.filter((row) => row.status !== 'ok').length;

  return (
    <section className="live" aria-label="Suivi de la classe en direct">
      <button type="button" className="live__toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>
          Suivi de la classe en direct
          {needHelp > 0 && <em className="live__count">{needHelp} à suivre</em>}
        </span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="live__body">
          {error && (
            <p className="live__error" role="alert">
              {error}
            </p>
          )}
          {data && (
            <>
              <ul className="live__summary">
                {data.summary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {rows.length > 0 && (
                <div className="live__scroll">
                  <table className="live__table">
                    <thead>
                      <tr>
                        <th scope="col">Participant</th>
                        <th scope="col">État</th>
                        <th scope="col">Résultat</th>
                        <th scope="col">Exposition</th>
                        <th scope="col">Stop-loss</th>
                        <th scope="col">A réagi à la news</th>
                        <th scope="col">À signaler</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.participantId}>
                          <th scope="row">{row.name}</th>
                          <td>
                            <span className={`live__status live__status--${row.status}`}>{STATUS_LABELS[row.status]}</span>
                          </td>
                          <td className={row.pnl < 0 ? 'live__neg' : row.pnl > 0 ? 'live__pos' : ''}>{money(row.pnl)}</td>
                          <td>{row.exposurePct.toLocaleString('fr-FR')} %</td>
                          <td>{row.openPositions === 0 ? '—' : row.unprotected === 0 ? 'Oui' : 'Non'}</td>
                          <td>{NEWS_LABELS[row.lastNews]}</td>
                          <td>{row.flags.length === 0 ? '—' : row.flags.map((flag) => flag.title).join(' · ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <small className="live__note">Minute {data.minute} / {data.durationMinutes} · constats calculés par des règles, sans IA générative.</small>
            </>
          )}
          {!data && !error && <p className="live__note">Chargement du suivi…</p>}
        </div>
      )}
    </section>
  );
}
