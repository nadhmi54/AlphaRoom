import { useEffect, useState } from 'react';
import { getClassSummary } from '../../services/aiService.js';
import { formatScore } from './aiLabels.js';

/**
 * Tableau de bord de la classe sur un passage : avancement des bilans et notes.
 * Chiffres calculés par le serveur à partir des notes du barème (aucun appel au
 * modèle). Si la synthèse est indisponible, on n'affiche rien : la liste des
 * bilans reste utilisable seule.
 */
export default function ClassSummaryPanel({ sessionId, run, refreshKey }) {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getClassSummary(sessionId, run);
        if (active) setSummary(data ?? null);
      } catch {
        if (active) setSummary(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [sessionId, run, refreshKey]);

  if (!summary || summary.total === 0) return null;

  const maxCount = Math.max(1, ...summary.distribution.map((bucket) => bucket.count));
  const expected = summary.expectedParticipants;

  return (
    <section className="ai-class" aria-label="Synthèse de la classe">
      <div className="ai-class__kpis">
        <div className="ai-kpi">
          <span className="ai-kpi__label">Bilans</span>
          <strong className="ai-kpi__value ui-num">
            {summary.total}
            {expected !== null && <small> / {expected}</small>}
          </strong>
          <span className="ai-kpi__hint">
            {summary.withoutReport ? `${summary.withoutReport} sans bilan` : 'tous les participants'}
          </span>
        </div>
        <div className="ai-kpi">
          <span className="ai-kpi__label">À relire</span>
          <strong className="ai-kpi__value ui-num">{summary.drafts}</strong>
          <span className="ai-kpi__hint">brouillons</span>
        </div>
        <div className="ai-kpi">
          <span className="ai-kpi__label">Publiés</span>
          <strong className="ai-kpi__value ui-num">{summary.published}</strong>
          <span className="ai-kpi__hint">
            {summary.validatedNotPublished > 0 ? `${summary.validatedNotPublished} validé${summary.validatedNotPublished > 1 ? 's' : ''}, non publié${summary.validatedNotPublished > 1 ? 's' : ''}` : 'visibles des étudiants'}
          </span>
        </div>
        {summary.overall && (
          <div className="ai-kpi ai-kpi--gold">
            <span className="ai-kpi__label">Note moyenne</span>
            <strong className="ai-kpi__value ui-num">
              {formatScore(summary.overall.mean)}
              <small> / {summary.outOf}</small>
            </strong>
            <span className="ai-kpi__hint">
              médiane {formatScore(summary.overall.median)} · de {formatScore(summary.overall.min)} à {formatScore(summary.overall.max)}
            </span>
          </div>
        )}
      </div>

      <div className="ai-class__detail">
        {summary.overall && (
          <figure className="ai-dist">
            <figcaption>Répartition des notes</figcaption>
            <ul>
              {summary.distribution.map((bucket) => (
                <li key={bucket.from}>
                  <span className="ai-dist__bar" aria-hidden="true">
                    <i style={{ height: `${(bucket.count / maxCount) * 100}%` }} />
                  </span>
                  <span className="ai-dist__count ui-num">{bucket.count}</span>
                  <span className="ai-dist__range">
                    {bucket.from}–{bucket.to}
                  </span>
                </li>
              ))}
            </ul>
          </figure>
        )}

        {summary.weakest && (
          <div className="ai-class__focus">
            <p>
              <span className="ai-class__tag ai-class__tag--down">Critère le plus faible</span>
              <strong>{summary.weakest.label}</strong>
              <span className="ui-num"> · moyenne {formatScore(summary.weakest.mean)} / {summary.outOf}</span>
            </p>
            {summary.strongest && (
              <p>
                <span className="ai-class__tag ai-class__tag--up">Critère le plus solide</span>
                <strong>{summary.strongest.label}</strong>
                <span className="ui-num"> · moyenne {formatScore(summary.strongest.mean)} / {summary.outOf}</span>
              </p>
            )}
            <p className="ai-muted">Moyennes calculées sur les notes du barème, corrections de l’enseignant comprises.</p>
          </div>
        )}
      </div>
    </section>
  );
}
