import { useEffect, useMemo, useState } from 'react';
import EvidenceChips from './EvidenceChips.jsx';
import ScoreBar from './ScoreBar.jsx';
import {
  SOURCE_LABELS,
  effectiveScore,
  formatDateTime,
  formatScore,
  missingDataLabel,
  statusLabel,
} from './aiLabels.js';
import { editReport, validateReport } from '../../services/aiService.js';

const LIMITS = { summary: 800, comment: 500, point: 300 };

function initialForm(report) {
  const { content } = report;
  return {
    summary: content.summary,
    criteria: Object.fromEntries(
      content.criteria.map((c) => [
        c.id,
        { comment: c.comment ?? '', teacherScore: c.teacherScore === null || c.teacherScore === undefined ? '' : String(c.teacherScore) },
      ]),
    ),
    strengths: content.strengths.map((p) => ({ ...p })),
    improvements: content.improvements.map((p) => ({ ...p })),
  };
}

/** Éditeur de bilan pour l'enseignant : corriger, valider, publier, voir la trace. */
export default function ReportEditor({ report, onChange }) {
  const [form, setForm] = useState(() => initialForm(report));
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null);

  const original = useMemo(() => initialForm(report), [report]);

  // Après un enregistrement ou une validation, le serveur renvoie le bilan à jour :
  // le formulaire repart de cette version (le message de confirmation reste affiché).
  useEffect(() => {
    setForm(initialForm(report));
  }, [report]);

  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  const { content, trace } = report;
  const name = report.displayName ? `${report.displayName} (${report.alias})` : report.alias;

  const setCriterion = (id, patch) =>
    setForm((current) => ({ ...current, criteria: { ...current.criteria, [id]: { ...current.criteria[id], ...patch } } }));
  const setPoint = (key, index, text) =>
    setForm((current) => ({
      ...current,
      [key]: current[key].map((point, i) => (i === index ? { ...point, text } : point)),
    }));
  const removePoint = (key, index) =>
    setForm((current) => ({ ...current, [key]: current[key].filter((_, i) => i !== index) }));

  async function run(action, successMessage) {
    setBusy(true);
    setBanner(null);
    try {
      const updated = await action();
      onChange(updated);
      setBanner({ kind: 'success', text: successMessage });
      return updated;
    } catch (error) {
      setBanner({ kind: 'error', text: error.message });
      return null;
    } finally {
      setBusy(false);
    }
  }

  function buildChanges() {
    return {
      summary: form.summary,
      criteria: content.criteria.map((c) => {
        const entry = form.criteria[c.id];
        const raw = entry.teacherScore.trim();
        return { id: c.id, comment: entry.comment, teacherScore: raw === '' ? null : Number(raw) };
      }),
      strengths: form.strengths.map((p) => ({ text: p.text, evidence: p.evidence })),
      improvements: form.improvements.map((p) => ({ text: p.text, evidence: p.evidence })),
    };
  }

  const invalidScore = content.criteria.some((c) => {
    const raw = form.criteria[c.id].teacherScore.trim();
    if (raw === '') return false;
    const value = Number(raw);
    return !Number.isInteger(value) || value < 0 || value > c.outOf;
  });

  return (
    <section className="ai-editor" aria-label={`Bilan de ${name}`}>
      <header className="ai-editor__head">
        <div>
          <h2>{name}</h2>
          <p className="ai-muted">
            Note globale : <strong>{formatScore(content.overall.score)}</strong> / {content.overall.outOf} · Mis à jour le{' '}
            {formatDateTime(report.updatedAt)}
          </p>
        </div>
        <span className={`ai-chip ${report.status === 'validated' ? 'ai-chip--ok' : 'ai-chip--draft'}`}>{statusLabel(report)}</span>
      </header>

      {banner && (
        <div className={`ar-ps__banner ar-ps__banner--${banner.kind}`} role={banner.kind === 'error' ? 'alert' : 'status'}>
          {banner.text}
        </div>
      )}

      <div className="ai-field">
        <label htmlFor={`summary-${report.id}`}>Synthèse</label>
        <textarea
          id={`summary-${report.id}`}
          className="ar-ps__input"
          rows={3}
          maxLength={LIMITS.summary}
          value={form.summary}
          onChange={(event) => setForm({ ...form, summary: event.target.value })}
        />
        <span className="ar-ps__hint">{form.summary.length} / {LIMITS.summary}</span>
      </div>

      <h3 className="ai-editor__title">Critères</h3>
      <ul className="ai-criteria">
        {content.criteria.map((criterion) => {
          const entry = form.criteria[criterion.id];
          return (
            <li key={criterion.id} className="ai-criterion">
              <div className="ai-criterion__top">
                <strong>{criterion.label}</strong>
                <span className="ai-muted">poids {Math.round(criterion.weight * 100)} %</span>
              </div>
              {criterion.status === 'evaluated' ? (
                <>
                  <div className="ai-criterion__score">
                    <ScoreBar score={effectiveScore(criterion)} outOf={criterion.outOf} />
                    <span className="ai-criterion__value">
                      Calculée : {formatScore(criterion.score)} / {criterion.outOf}
                    </span>
                    {criterion.displayValue && <span className="ai-chip">Mesuré : {criterion.displayValue}</span>}
                  </div>
                  <p className="ai-criterion__rule">
                    <span>Règle appliquée</span> {criterion.rule}
                  </p>
                  <EvidenceChips evidence={criterion.evidence} label={`Preuves de la note ${criterion.label}`} />
                </>
              ) : (
                <p className="ai-muted">Non évalué : {criterion.reason ?? 'données insuffisantes'}.</p>
              )}
              <div className="ai-criterion__edit">
                <div className="ai-field ai-field--small">
                  <label htmlFor={`score-${report.id}-${criterion.id}`}>Note corrigée (0 à {criterion.outOf})</label>
                  <input
                    id={`score-${report.id}-${criterion.id}`}
                    className="ar-ps__input"
                    inputMode="numeric"
                    placeholder="aucune"
                    value={entry.teacherScore}
                    disabled={criterion.status !== 'evaluated'}
                    onChange={(event) => setCriterion(criterion.id, { teacherScore: event.target.value })}
                  />
                </div>
                <div className="ai-field">
                  <label htmlFor={`comment-${report.id}-${criterion.id}`}>Commentaire</label>
                  <textarea
                    id={`comment-${report.id}-${criterion.id}`}
                    className="ar-ps__input"
                    rows={2}
                    maxLength={LIMITS.comment}
                    value={entry.comment}
                    onChange={(event) => setCriterion(criterion.id, { comment: event.target.value })}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {[
        ['strengths', 'Points forts'],
        ['improvements', 'Pistes d’amélioration'],
      ].map(([key, title]) => (
        <section key={key} className="ai-block">
          <h3>{title}</h3>
          {form[key].length === 0 && <p className="ai-muted">Aucun élément.</p>}
          <ul className="ai-points ai-points--edit">
            {form[key].map((point, index) => (
              <li key={index}>
                <textarea
                  className="ar-ps__input"
                  rows={2}
                  maxLength={LIMITS.point}
                  aria-label={`${title} ${index + 1}`}
                  value={point.text}
                  onChange={(event) => setPoint(key, index, event.target.value)}
                />
                <EvidenceChips evidence={point.evidence} />
                <button type="button" className="ar-ps__btn ar-ps__btn--ghost" onClick={() => removePoint(key, index)}>
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {content.missingData.length > 0 && (
        <section className="ai-block ai-note">
          <h3>Informations manquantes</h3>
          <ul>
            {content.missingData.map((code) => (
              <li key={code}>{missingDataLabel(code)}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="ai-actions">
        <button
          type="button"
          className="ar-ps__btn"
          disabled={busy || !dirty || invalidScore}
          onClick={() => run(() => editReport(report.id, buildChanges()), 'Modifications enregistrées. Le bilan repasse en brouillon.')}
        >
          Enregistrer les modifications
        </button>
        <button
          type="button"
          className="ar-ps__btn"
          disabled={busy || dirty}
          title={dirty ? 'Enregistre d’abord tes modifications' : undefined}
          onClick={() => run(() => validateReport(report.id, false), 'Bilan validé (non publié).')}
        >
          Valider
        </button>
        <button
          type="button"
          className="ar-ps__btn ar-ps__btn--primary"
          disabled={busy || dirty}
          title={dirty ? 'Enregistre d’abord tes modifications' : undefined}
          onClick={() => run(() => validateReport(report.id, true), 'Bilan validé et publié : l’étudiant peut le consulter.')}
        >
          Valider et publier
        </button>
        {report.status === 'validated' && report.published && (
          <button
            type="button"
            className="ar-ps__btn ar-ps__btn--ghost"
            disabled={busy || dirty}
            onClick={() => run(() => validateReport(report.id, false), 'Bilan retiré de la publication.')}
          >
            Retirer de la publication
          </button>
        )}
      </div>
      {invalidScore && <p className="ar-ps__error">Une note corrigée doit être un entier entre 0 et le maximum du critère.</p>}

      {trace && (
        <details className="ai-trace">
          <summary>Trace : d’où vient ce bilan ?</summary>
          <dl>
            <dt>Source du texte</dt>
            <dd>{SOURCE_LABELS[trace.source] ?? trace.source}</dd>
            <dt>Fournisseur / modèle</dt>
            <dd>{trace.provider} / {trace.model}</dd>
            <dt>Version du prompt · du barème</dt>
            <dd>{trace.promptVersion} · {trace.rubricVersion}</dd>
            <dt>Empreinte des données (SHA-256)</dt>
            <dd className="ai-mono">{trace.contextHash}</dd>
            <dt>Tentatives · tokens (entrée / sortie)</dt>
            <dd>{trace.attempts} · {trace.usage.inputTokens} / {trace.usage.outputTokens}</dd>
            <dt>Généré le</dt>
            <dd>{formatDateTime(trace.generatedAt)}</dd>
            <dt>Problèmes rencontrés</dt>
            <dd>
              {trace.issues.length === 0 ? (
                'Aucun'
              ) : (
                <ul>
                  {trace.issues.map((issue, index) => (
                    <li key={index}>{issue.message}</li>
                  ))}
                </ul>
              )}
            </dd>
          </dl>
        </details>
      )}
    </section>
  );
}
