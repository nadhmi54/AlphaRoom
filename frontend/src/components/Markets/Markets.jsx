import { useMemo, useRef, useState } from 'react';
import { MARKET_ASSETS } from '../../data/marketAssets.js';
import './Markets.css';

// Courbe d'illustration déterministe (même courbe à chaque affichage pour un
// actif donné) : marche aléatoire à graine fixe, avec une tendance haussière
// ou baissière selon `up`. Ce sont des données d'exemple, remplacées par les
// vraies séries de prix quand le module M1 fournira les données live.
function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHART_W = 600;
const CHART_H = 220;
const CHART_PAD = 18;

function buildChart(id, up, points = 56) {
  const rand = mulberry32(hashSeed(id));
  const values = [];
  let v = 0;
  for (let i = 0; i < points; i += 1) {
    v += (rand() - 0.5) * 2 + (up ? 0.16 : -0.16);
    values.push(v);
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = values.map((val, i) => {
    const x = (i / (points - 1)) * CHART_W;
    const y = CHART_PAD + (1 - (val - min) / span) * (CHART_H - CHART_PAD * 2);
    return [x, y];
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${CHART_W} ${CHART_H} L0 ${CHART_H} Z`;
  return { line, area };
}

function AssetChart({ asset }) {
  const { line, area } = useMemo(() => buildChart(asset.id, asset.up), [asset.id, asset.up]);
  const gradientId = `ar-chart-fill-${asset.id}`;

  return (
    <svg
      className={`ar-market-chart ${asset.up ? 'is-up' : 'is-down'}`}
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Évolution simulée de ${asset.name}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.34" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((ratio) => (
        <line
          key={ratio}
          x1="0"
          x2={CHART_W}
          y1={CHART_H * ratio}
          y2={CHART_H * ratio}
          className="ar-market-chart__grid"
        />
      ))}
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} className="ar-market-chart__line" />
    </svg>
  );
}

export default function Markets() {
  const [activeId, setActiveId] = useState(MARKET_ASSETS[0].id);
  const tabRefs = useRef({});
  const active = MARKET_ASSETS.find((asset) => asset.id === activeId) ?? MARKET_ASSETS[0];

  // Navigation clavier entre onglets (flèches gauche/droite, Début, Fin).
  const handleKeyDown = (event, index) => {
    const last = MARKET_ASSETS.length - 1;
    let next = null;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    const target = MARKET_ASSETS[next];
    setActiveId(target.id);
    tabRefs.current[target.id]?.focus();
  };

  return (
    <section id="markets" className="ar-markets">
      <div className="ar-markets__inner">
        <header className="ar-markets__head">
          <span className="ar-markets__pill">
            <span className="ar-markets__pill-dot" />
            {MARKET_ASSETS.length} classes d&apos;actifs
          </span>
          <h2 className="ar-markets__title">
            Cinq marchés,
            <br />
            <span className="ar-markets__title--accent">un seul terrain de jeu.</span>
          </h2>
          <p className="ar-markets__lead">
            Des métaux précieux aux indices actions : explore chaque marché, comprends ce qui fait
            bouger son prix, puis trade-le sans jamais risquer un centime.
          </p>
        </header>

        <div className="ar-markets__tabs" role="tablist" aria-label="Classes d'actifs">
          {MARKET_ASSETS.map((asset, index) => (
            <button
              key={asset.id}
              id={`ar-tab-${asset.id}`}
              ref={(el) => {
                tabRefs.current[asset.id] = el;
              }}
              type="button"
              role="tab"
              aria-selected={asset.id === activeId}
              aria-controls={`ar-panel-${asset.id}`}
              tabIndex={asset.id === activeId ? 0 : -1}
              className="ar-markets__tab"
              onClick={() => setActiveId(asset.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <img
                src={asset.image}
                alt=""
                width="560"
                height="350"
                loading="lazy"
                className="ar-markets__tab-img"
              />
              <span className="ar-markets__tab-content">
                <span className="ar-markets__tab-symbol">{asset.symbol}</span>
                <span className="ar-markets__tab-name">{asset.name}</span>
                <span className={`ar-markets__tab-change ${asset.up ? 'is-up' : 'is-down'}`}>
                  {asset.up ? '▲' : '▼'} {asset.change}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div
          key={active.id}
          id={`ar-panel-${active.id}`}
          role="tabpanel"
          aria-labelledby={`ar-tab-${active.id}`}
          className="ar-markets__panel"
        >
          <div className="ar-markets__info">
            <span className="ar-markets__category">{active.category}</span>
            <h3 className="ar-markets__asset-name">{active.name}</h3>

            <div className="ar-markets__quote">
              <span className="ar-markets__price">{active.price}</span>
              <span className={`ar-markets__change ${active.up ? 'is-up' : 'is-down'}`}>
                {active.up ? '▲' : '▼'} {active.change}
              </span>
              <span className="ar-markets__symbol">{active.symbol}</span>
            </div>

            <p className="ar-markets__desc">{active.description}</p>

            <dl className="ar-markets__facts">
              {active.facts.map((fact) => (
                <div key={fact.label} className="ar-markets__fact">
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <figure className="ar-markets__chart-card">
            <figcaption className="ar-markets__chart-head">
              <span>{active.symbol}</span>
              <span className="ar-markets__chart-tag">Évolution simulée</span>
            </figcaption>
            <AssetChart asset={active} />
          </figure>
        </div>

        <p className="ar-markets__note">
          Prix et courbes : données d&apos;exemple, remplacées par les données live du module
          Marché, Trading &amp; Portefeuille.
        </p>
      </div>
    </section>
  );
}
