import { useEffect, useMemo, useRef, useState } from 'react';
import { getAiShockProjection } from '../../services/gameRoomService.js';
import './ShockProjectionPanel.css';

const POLL_MS = 10_000;
const DEFAULT_WIDTH = 640;
const PAD = { left: 64, right: 16, top: 14, bottom: 28 };

const SCENARIO_STYLE = {
  retour: { color: '#5ad1a0', label: 'Retour au niveau d’avant' },
  rebond_partiel: { color: '#d9b877', label: 'Rebond partiel' },
  continuation: { color: '#ff7a8a', label: 'Continuation du choc' },
};

const fr = (value, digits = 2) =>
  Number(value).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
const priceDigits = (price) => (price >= 100 ? 2 : price >= 10 ? 3 : 5);
const money = (value) => `${value > 0 ? '+' : ''}${fr(value, 0)} $`;

/** Largeur réelle du conteneur : le graphique se redessine à la bonne taille (texte lisible sur téléphone). */
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(300, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function FanChart({ projection }) {
  const [wrapRef, WIDTH] = useWidth();
  const HEIGHT = WIDTH < 500 ? 230 : 250;
  const { eventail, scenarios, choc, ta_position: position, actif } = projection;
  const history = projection.historique ?? [];
  const geometry = useMemo(() => {
    const prices = [
      ...eventail.flatMap((p) => [p.bas_5, p.haut_95]),
      ...scenarios.flatMap((s) => s.trajectoire.map((t) => t.prix)),
      ...history.map((h) => h.prix),
      choc.prix_avant,
    ];
    if (position?.stop_loss) prices.push(position.stop_loss);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const margin = (max - min || max * 0.01) * 0.08;
    const low = min - margin;
    const high = max + margin;
    const first = Math.min(eventail[0].minute, history[0]?.minute ?? eventail[0].minute);
    const last = eventail.at(-1).minute;
    const x = (minute) => PAD.left + ((minute - first) / Math.max(1, last - first)) * (WIDTH - PAD.left - PAD.right);
    const y = (price) => PAD.top + (1 - (price - low) / (high - low)) * (HEIGHT - PAD.top - PAD.bottom);
    return { x, y, low, high, first, last };
  }, [eventail, scenarios, history, choc.prix_avant, position?.stop_loss, WIDTH, HEIGHT]);

  const { x, y, low, high, first, last } = geometry;
  const digits = priceDigits(projection.prix_actuel);
  const band = (upper, lower) =>
    `${eventail.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.minute)},${y(p[upper])}`).join(' ')} ` +
    `${[...eventail].reverse().map((p) => `L${x(p.minute)},${y(p[lower])}`).join(' ')} Z`;
  const line = (points, getPrice) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.minute)},${y(getPrice(p))}`).join(' ');
  const ticks = [low, (low + high) / 2, high];

  return (
    <div ref={wrapRef} className="shock__chartwrap">
    <svg
      className="shock__chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Éventail des trajectoires possibles de ${actif} après le choc`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} className="shock__grid" />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="shock__axis">
            {fr(t, digits)}
          </text>
        </g>
      ))}
      <path d={band('haut_95', 'bas_5')} className="shock__band shock__band--wide" />
      <path d={band('haut_75', 'bas_25')} className="shock__band shock__band--core" />

      <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(choc.prix_avant)} y2={y(choc.prix_avant)} className="shock__ref" />
      <text x={WIDTH - PAD.right} y={y(choc.prix_avant) - 5} textAnchor="end" className="shock__ref-label">
        niveau d’avant le choc
      </text>
      {position?.stop_loss ? (
        <>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(position.stop_loss)} y2={y(position.stop_loss)} className="shock__stop" />
          <text x={WIDTH - PAD.right} y={y(position.stop_loss) - 5} textAnchor="end" className="shock__stop-label">
            ton stop-loss
          </text>
        </>
      ) : null}

      {scenarios.map((s) => (
        <path key={s.id} d={line(s.trajectoire, (p) => p.prix)} fill="none" stroke={SCENARIO_STYLE[s.id]?.color ?? '#9aa3b6'} strokeWidth="2" strokeDasharray="5 4" />
      ))}
      {history.length > 1 && (
        <>
          <line x1={x(choc.minute)} x2={x(choc.minute)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="shock__shockline" />
          <text x={x(choc.minute) + 5} y={PAD.top + 10} className="shock__ref-label">
            choc
          </text>
          <path d={line(history, (p) => p.prix)} className="shock__history" />
        </>
      )}
      <path d={line(eventail, (p) => p.median)} className="shock__median" />
      <circle cx={x(eventail[0].minute)} cy={y(eventail[0].median)} r="4" className="shock__now" />

      <text x={x(first)} y={HEIGHT - 8} textAnchor="start" className="shock__axis">
        minute {first}
      </text>
      <text x={x(eventail[0].minute)} y={HEIGHT - 8} textAnchor="middle" className="shock__axis">
        maintenant
      </text>
      <text x={x(last)} y={HEIGHT - 8} textAnchor="end" className="shock__axis">
        minute {last}
      </text>
    </svg>
    </div>
  );
}

/**
 * Projection IA après un choc de marché. Les chiffres viennent du serveur : volatilité mesurée dans la salle,
 * simulation sans direction imposée, trois scénarios nommés. Ce n'est PAS une prévision, et le panneau le dit.
 * Il apparaît tout seul quand un choc survient et disparaît tant qu'il n'y en a pas.
 */
export default function ShockProjectionPanel({ roomId }) {
  const [data, setData] = useState(null);
  const [selectedShockId, setSelectedShockId] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const seenShock = useRef(null);

  useEffect(() => {
    if (!roomId) return undefined;
    let alive = true;
    async function load() {
      try {
        const result = selectedShockId
          ? await getAiShockProjection(roomId, selectedShockId)
          : await getAiShockProjection(roomId);
        if (!alive) return;
        setError('');
        setData(result);
        const latestId = result?.shocks?.at(-1)?.id || result?.projection?.choc?.id || null;
        // Un nouveau choc ouvre le panneau automatiquement : c'est le moment utile.
        if (latestId && latestId !== seenShock.current && result.projection?.choc?.recent) {
          setOpen(true);
        }
        seenShock.current = latestId;
      } catch (e) {
        if (alive) setError(e.message || 'Projection indisponible.');
      }
    }
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [roomId, selectedShockId]);

  const projection = data?.projection;
  if (!projection) return error ? <p className="shock__error" role="alert">{error}</p> : null;

  const { choc, probabilites, volatilite, ta_position: position } = projection;
  const down = choc.variation_pct < 0;
  const rawShocks = data?.shocks?.length ? data.shocks : [
    { id: choc.id, minute: choc.minute, type: choc.type, label: choc.titre },
  ];
  const shocks = [...rawShocks].sort((a, b) => a.minute - b.minute);
  const currentIndex = shocks.findIndex((s) => s.id === choc.id);
  const isLatest = currentIndex === shocks.length - 1 || (!selectedShockId && currentIndex === -1);

  return (
    <section className="shock" aria-label="Projection IA après le choc">
      <button type="button" className="shock__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="shock__title">
          <span className={`shock__badge ${choc.recent ? 'shock__badge--live' : ''}`}>
            {isLatest ? (choc.recent ? 'Choc récent' : 'Dernier choc') : `Choc #${currentIndex + 1} (min ${choc.minute})`}
          </span>
          Après le choc · {projection.actif}{' '}
          <span className={down ? 'shock__down' : 'shock__up'}>
            {down ? '▼' : '▲'} {fr(Math.abs(choc.variation_pct))} %
          </span>
          {shocks.length > 1 && (
            <span className="shock__counter-badge">
              Choc {currentIndex >= 0 ? currentIndex + 1 : 1} / {shocks.length}
            </span>
          )}
        </span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="shock__body">
          {/* Sélecteur de choc si plusieurs chocs ont eu lieu */}
          {shocks.length > 1 && (
            <div className="shock__switcher" role="tablist" aria-label="Historique des chocs">
              <span className="shock__switcher-title">Chocs survenus ({shocks.length}) :</span>
              <div className="shock__pills">
                {shocks.map((s, idx) => {
                  const isActive = (choc.id === s.id) || (!selectedShockId && idx === shocks.length - 1);
                  const isLastShock = idx === shocks.length - 1;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`shock__pill ${isActive ? 'is-active' : ''}`}
                      onClick={() => setSelectedShockId(s.id)}
                      title={s.label}
                    >
                      <span className="shock__pill-num">#{idx + 1}</span>
                      <span className="shock__pill-minute">Min {s.minute}</span>
                      <span className="shock__pill-label">{s.label}</span>
                      {isLastShock && <span className="shock__pill-tag">Dernier</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p className="shock__lead">
            Minute {choc.minute} : « {choc.titre} ». Voici la fourchette du prix pour les {projection.horizon_minutes} prochaines minutes, selon la volatilité mesurée dans la salle.
          </p>

          <FanChart projection={projection} />

          <ul className="shock__legend" aria-label="Légende">
            <li><span className="shock__swatch shock__swatch--wide" />9 cas sur 10</li>
            <li><span className="shock__swatch shock__swatch--core" />1 cas sur 2</li>
            <li><span className="shock__swatch shock__swatch--median" />Médiane</li>
            {projection.scenarios.map((s) => (
              <li key={s.id}>
                <span className="shock__swatch" style={{ background: SCENARIO_STYLE[s.id]?.color }} />
                {SCENARIO_STYLE[s.id]?.label ?? s.titre} (vers {fr(s.niveau_cible, priceDigits(projection.prix_actuel))})
              </li>
            ))}
          </ul>

          <dl className="shock__stats">
            <div>
              <dt>Repasse par le niveau d’avant</dt>
              <dd>{fr(probabilites.repasse_par_le_niveau_d_avant_pct)} %</dd>
            </div>
            <div>
              <dt>Finit sous le prix actuel</dt>
              <dd>{fr(probabilites.finit_sous_le_prix_actuel_pct)} %</dd>
            </div>
            <div>
              <dt>Volatilité de départ</dt>
              <dd>{fr(volatilite.utilisee_au_depart_par_minute_pct)} % / min</dd>
            </div>
          </dl>

          {position && (
            <div className="shock__position">
              <strong>Sur ta position ({fr(position.quantite)} {projection.actif})</strong>
              <span>
                Dans la fourchette : {money(position.gain_perte_si_bas_5)} dans le pire des cas probables, {money(position.gain_perte_si_haut_95)} dans le meilleur.
              </span>
              <span>
                {position.stop_loss === null
                  ? 'Tu n’as pas de stop-loss sur cette position.'
                  : `Ton stop-loss à ${fr(position.stop_loss, priceDigits(projection.prix_actuel))} a ${fr(position.probabilite_stop_touche_pct)} % de chances d’être touché.`}
              </span>
            </div>
          )}

          <p className="shock__warning">{projection.avertissement}</p>
        </div>
      )}
    </section>
  );
}
