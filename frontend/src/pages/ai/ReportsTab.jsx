import { useCallback, useEffect, useState } from 'react';
import ReportEditor from './ReportEditor.jsx';
import { formatScore, statusLabel } from './aiLabels.js';
import { generateReports, listReports } from '../../services/aiService.js';

/** Liste des bilans d'un passage + génération des brouillons + édition. */
export default function ReportsTab({ sessionId, run }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReports(await listReports(sessionId, run));
      setBanner((current) => (current?.kind === 'error' ? null : current));
    } catch (error) {
      setReports([]);
      setBanner({ kind: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }, [sessionId, run]);

  useEffect(() => {
    setSelectedId(null);
    load();
  }, [load]);

  async function generate() {
    setBusy(true);
    setBanner(null);
    try {
      const result = await generateReports(sessionId, run);
      const skipped = result.skippedValidated.length;
      setBanner({
        kind: 'success',
        text:
          `${result.reports.length} brouillon${result.reports.length > 1 ? 's' : ''} généré${result.reports.length > 1 ? 's' : ''}.` +
          (skipped > 0 ? ` ${skipped} bilan${skipped > 1 ? 's' : ''} déjà validé${skipped > 1 ? 's' : ''} conservé${skipped > 1 ? 's' : ''} tel${skipped > 1 ? 's' : ''} quel${skipped > 1 ? 's' : ''}.` : ''),
      });
      await load();
    } catch (error) {
      setBanner({ kind: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  }

  const replace = (updated) => setReports((current) => current.map((r) => (r.id === updated.id ? updated : r)));
  const selected = reports.find((r) => r.id === selectedId);

  return (
    <div>
      <div className="ai-toolbar">
        <p className="ai-muted">
          L’IA prépare un <strong>brouillon</strong> par étudiant ; les notes viennent du barème, jamais du modèle. Rien n’est visible par
          les étudiants avant ta validation et ta publication.
        </p>
        <button type="button" className="ar-ps__btn ar-ps__btn--primary" disabled={busy} onClick={generate}>
          {busy ? 'Génération…' : reports.length > 0 ? 'Régénérer les brouillons' : 'Générer les bilans'}
        </button>
      </div>

      {banner && (
        <div className={`ar-ps__banner ar-ps__banner--${banner.kind}`} role={banner.kind === 'error' ? 'alert' : 'status'}>
          {banner.text}
        </div>
      )}

      <div className="ai-tablewrap">
        <table className="ai-table">
          <thead>
            <tr>
              <th>Étudiant</th>
              <th>Note / 4</th>
              <th>Statut</th>
              <th>Texte</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id} className={report.id === selectedId ? 'is-selected' : ''}>
                <td>
                  <strong>{report.displayName ?? report.alias}</strong>
                  <span className="ai-sub">{report.alias}</span>
                </td>
                <td>{formatScore(report.content.overall.score)}</td>
                <td>
                  <span className={`ai-chip ${report.status === 'validated' ? 'ai-chip--ok' : 'ai-chip--draft'}`}>{statusLabel(report)}</span>
                </td>
                <td>{report.trace?.source === 'llm' ? 'IA vérifiée' : 'Règles du code'}</td>
                <td>
                  <button type="button" className="ar-ps__btn" onClick={() => setSelectedId(report.id)}>
                    Ouvrir
                  </button>
                </td>
              </tr>
            ))}
            {!loading && reports.length === 0 && (
              <tr>
                <td colSpan={5} className="ai-empty">
                  Aucun bilan pour ce passage. Clique sur « Générer les bilans ».
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && <ReportEditor key={selected.id} report={selected} onChange={replace} />}
    </div>
  );
}
