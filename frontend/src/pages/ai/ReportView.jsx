import EvidenceChips from './EvidenceChips.jsx';
import ScoreBar from './ScoreBar.jsx';
import { effectiveScore, formatScore, missingDataLabel } from './aiLabels.js';

function Points({ title, points, empty }) {
  return (
    <section className="ai-block">
      <h3>{title}</h3>
      {points.length === 0 ? (
        <p className="ai-muted">{empty}</p>
      ) : (
        <ul className="ai-points">
          {points.map((point, index) => (
            <li key={index}>
              <p>{point.text}</p>
              <EvidenceChips evidence={point.evidence} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Bilan en lecture seule : la note de chaque critère avec la règle appliquée et
 * les preuves. C'est l'écran « Pourquoi cette note ? » de l'étudiant.
 */
export default function ReportView({ report }) {
  const { content } = report;
  const overall = content.overall;
  const final = overall.score;

  return (
    <article className="ai-report" aria-label="Bilan de séance">
      <header className="ai-report__head">
        <div className="ai-report__score" aria-label={final === null ? 'Note globale non disponible' : `Note globale ${formatScore(final)} sur ${overall.outOf}`}>
          <strong>{formatScore(final)}</strong>
          <span>/ {overall.outOf}</span>
        </div>
        <div>
          <h2>Pourquoi cette note ?</h2>
          <p className="ai-muted">
            Moyenne pondérée de {overall.evaluated} critère{overall.evaluated > 1 ? 's' : ''} évalué
            {overall.evaluated > 1 ? 's' : ''}
            {overall.partial ? ` sur ${overall.total} (les autres n’ont pas pu être mesurés)` : ''}.
          </p>
        </div>
      </header>

      <p className="ai-report__summary">{content.summary}</p>

      <section className="ai-block">
        <h3>Critère par critère</h3>
        <ul className="ai-criteria">
          {content.criteria.map((criterion) => {
            const score = effectiveScore(criterion);
            return (
              <li key={criterion.id} className="ai-criterion">
                <div className="ai-criterion__top">
                  <strong>{criterion.label}</strong>
                  <span className="ai-muted">poids {Math.round(criterion.weight * 100)} %</span>
                </div>
                {criterion.status === 'evaluated' ? (
                  <>
                    <div className="ai-criterion__score">
                      <ScoreBar score={score} outOf={criterion.outOf} />
                      <span className="ai-criterion__value">
                        {formatScore(score)} / {criterion.outOf}
                      </span>
                      {criterion.displayValue && <span className="ai-chip">Mesuré : {criterion.displayValue}</span>}
                    </div>
                    {criterion.teacherScore !== null && criterion.teacherScore !== undefined && (
                      <p className="ai-criterion__override">
                        Note corrigée par ton enseignant (calcul automatique : {formatScore(criterion.score)} / {criterion.outOf}).
                      </p>
                    )}
                    <p className="ai-criterion__rule">
                      <span>Règle appliquée</span> {criterion.rule}
                    </p>
                    <EvidenceChips evidence={criterion.evidence} label={`Preuves de la note ${criterion.label}`} />
                    {criterion.comment && <p className="ai-criterion__comment">{criterion.comment}</p>}
                  </>
                ) : (
                  <p className="ai-muted">Non évalué : {criterion.reason ?? 'données insuffisantes'}.</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="ai-columns">
        <Points title="Points forts" points={content.strengths} empty="Aucun point fort relevé sur ce passage." />
        <Points title="Pistes d’amélioration" points={content.improvements} empty="Aucune piste relevée sur ce passage." />
      </div>

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

      <footer className="ai-report__how">
        <h3>Comment ce bilan est produit</h3>
        <ol>
          <li>Les chiffres sont calculés par le code à partir de tes ordres et des prix de la séance.</li>
          <li>Chaque note applique un barème visible : la règle est écrite sous chaque critère.</li>
          <li>L’IA ne fait que rédiger les commentaires ; chaque chiffre cité est vérifié, puis ton enseignant relit et valide.</li>
        </ol>
      </footer>
    </article>
  );
}
