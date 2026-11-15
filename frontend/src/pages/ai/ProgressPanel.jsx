import { useEffect, useState } from 'react';
import { getProgress } from '../../services/aiService.js';
import { formatScore } from './aiLabels.js';

const W = 320;
const H = 120;
const PAD = { left: 28, right: 14, top: 12, bottom: 20 };

function Trend({ delta }) {
  if (delta === null || delta === undefined) return null;
  if (delta === 0) return <span className="ui-chip">= identique au bilan précédent</span>;
  const up = delta > 0;
  return (
    <span className={`ui-chip ${up ? 'ui-chip--up' : 'ui-chip--down'} ui-num`}>
      {up ? '▲ +' : '▼ '}
      {formatScore(delta)} depuis le bilan précédent
    </span>
  );
}

function Chart({ points, outOf, titles }) {
  const usable = points.filter((p) => p.overall.score !== null);
  const x = (index) => PAD.left + (usable.length === 1 ? (W - PAD.left - PAD.right) / 2 : (index * (W - PAD.left - PAD.right)) / (usable.length - 1));
  const y = (score) => PAD.top + (1 - score / outOf) * (H - PAD.top - PAD.bottom);
  const path = usable.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.overall.score).toFixed(1)}`).join(' ');

  return (
    <svg className="ai-progress__chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Évolution de ta note d’un bilan à l’autre">
      {Array.from({ length: outOf + 1 }, (_, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(i)} y2={y(i)} className="ai-progress__grid" />
          <text x={PAD.left - 8} y={y(i) + 3} textAnchor="end" className="ai-progress__axis">
            {i}
          </text>
        </g>
      ))}
      {usable.length > 1 && <path d={path} className="ai-progress__line" />}
      {usable.map((p, i) => (
        <g key={p.reportId}>
          <circle cx={x(i)} cy={y(p.overall.score)} r="4.5" className="ai-progress__dot" />
          <title>
            {titles[p.sessionId] ?? 'Séance'} : {formatScore(p.overall.score)} / {outOf}
          </title>
        </g>
      ))}
    </svg>
  );
}

/**
 * Évolution de la note de l'étudiant d'un bilan publié à l'autre. Chiffres
 * calculés par le serveur ; masqué si la progression est indisponible.
 */
export default function ProgressPanel({ titles = {}, refreshKey }) {
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getProgress();
        if (active) setProgress(data ?? null);
      } catch {
        if (active) setProgress(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (!progress || progress.points.length === 0) return null;

  const { points, delta, criteriaTrends, focus } = progress;
  const latest = points.at(-1);
  const outOf = latest.overall.outOf;

  return (
    <section className="ai-progress" aria-label="Ma progression">
      <div className="ai-progress__main">
        <h2 className="ai-progress__title">Ma progression</h2>
        <p className="ai-progress__score">
          <strong className="ui-num">{formatScore(latest.overall.score)}</strong>
          <span> / {outOf} au dernier bilan</span>
        </p>
        <Trend delta={delta} />
        {points.length === 1 && <p className="ai-muted">Ta courbe apparaîtra dès ton deuxième bilan publié.</p>}
        {focus && (
          <p className="ai-progress__focus">
            <span className="ai-class__tag ai-class__tag--gold">À travailler</span>
            <strong>{focus.label}</strong>
            <span className="ui-num"> · {formatScore(focus.score)} / {outOf}</span>
          </p>
        )}
      </div>

      {points.length > 1 && <Chart points={points} outOf={outOf} titles={titles} />}

      {criteriaTrends.length > 0 && (
        <ul className="ai-progress__criteria" aria-label="Évolution par critère">
          {criteriaTrends.map((trend) => (
            <li key={trend.id}>
              <span>{trend.label}</span>
              <span className={`ui-num ${trend.delta > 0 ? 'ui-up' : trend.delta < 0 ? 'ui-down' : ''}`}>
                {formatScore(trend.previous, 0)} → {formatScore(trend.latest, 0)}
                {trend.delta > 0 ? ' ▲' : trend.delta < 0 ? ' ▼' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
