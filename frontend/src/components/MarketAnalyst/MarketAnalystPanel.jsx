import { useState } from 'react';
import { getAiMarketAnalysis } from '../../services/gameRoomService.js';
import EvidenceChips from '../../pages/ai/EvidenceChips.jsx';
import './MarketAnalystPanel.css';

const COMMENTARY_LABELS = {
  llm: 'Commentaire rédigé par l’IA · chiffres vérifiés',
  rules: 'Commentaire construit à partir des chiffres',
};

/**
 * Market Analyst : lecture du marché de la salle. Les chiffres (prix, variations,
 * réactions aux événements) sont calculés par le serveur ; le commentaire
 * du modèle, quand il existe, est contrôlé. Aucun conseil d'achat ou de vente.
 */
export default function MarketAnalystPanel({ roomId }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function load() {
    if (!roomId || busy) return;
    setBusy(true);
    setError('');
    try {
      setResult(await getAiMarketAnalysis(roomId));
    } catch (e) {
      setError(e.message || 'Analyse indisponible.');
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !result) load();
  }

  const highlights = result?.analysis?.highlights ?? [];

  return (
    <section className="analyst" aria-label="Analyste de marché IA">
      <button type="button" className="analyst__toggle" aria-expanded={open} onClick={toggle}>
        <span>Analyste de marché IA</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="analyst__body">
          {busy && <p className="analyst__note">Lecture du marché en cours…</p>}
          {error && (
            <p className="analyst__error" role="alert">
              {error}
            </p>
          )}

          {result && !busy && (
            <>
              {highlights.length === 0 ? (
                <p className="analyst__note">Pas encore assez de mouvements pour une lecture du marché.</p>
              ) : (
                <ul className="analyst__list">
                  {highlights.map((item, index) => (
                    <li key={index}>
                      <span>{item.text}</span>
                      <EvidenceChips evidence={item.evidence} />
                    </li>
                  ))}
                </ul>
              )}
              {result.commentary && (
                <div className="analyst__commentary">
                  <p>{result.commentary}</p>
                  <small>{COMMENTARY_LABELS[result.commentarySource] ?? COMMENTARY_LABELS.rules}</small>
                </div>
              )}
            </>
          )}

          <button type="button" className="analyst__refresh" onClick={load} disabled={busy}>
            Actualiser l’analyse
          </button>
        </div>
      )}
    </section>
  );
}
