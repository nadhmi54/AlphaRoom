import './LoadingScreen.css';

const TICKER = [
  { s: 'XAU/USD', c: '+0.42%', up: true },
  { s: 'EUR/USD', c: '−0.12%', up: false },
  { s: 'S&P 500', c: '+0.31%', up: true },
  { s: 'XAG/USD', c: '+0.88%', up: true },
  { s: 'WTI', c: '−0.64%', up: false },
  { s: 'BTC/USD', c: '+1.20%', up: true },
];

// Trajectoire d'un cours qui monte avec des à-coups (viewBox 1200 x 300).
const CHART_LINE =
  'M0 250 L90 232 L170 244 L260 205 L340 218 L430 170 L510 186 L600 140 L690 158 L780 108 L870 126 L960 78 L1050 96 L1200 40';

const CANDLES = [
  { h: 26, up: true },
  { h: 38, up: false },
  { h: 32, up: true },
  { h: 48, up: true },
  { h: 36, up: false },
  { h: 54, up: true },
];

// Écran de chargement : le logo AlphaRoom animé sur un fond de salle de marché
// (courbe de cours qui se dessine, bougies, bandeau de cotations).
// `leaving` déclenche le fondu de sortie ; `layer` règle l'empilement.
export default function LoadingScreen({ leaving = false, layer = 'top' }) {
  const items = [...TICKER, ...TICKER];

  return (
    <div
      className={`ar-loader ar-loader--${layer} ${leaving ? 'is-leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Chargement en cours"
    >
      <div className="ar-loader__grid" aria-hidden="true" />
      <div className="ar-loader__glow" aria-hidden="true" />

      <svg
        className="ar-loader__chart"
        viewBox="0 0 1200 300"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="ar-loader-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#2dd4bf" />
            <stop offset="1" stopColor="#d9b877" />
          </linearGradient>
          <linearGradient id="ar-loader-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#d9b877" stopOpacity="0.22" />
            <stop offset="1" stopColor="#d9b877" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="ar-loader__area" d={`${CHART_LINE} L1200 300 L0 300 Z`} fill="url(#ar-loader-area)" />
        <path
          className="ar-loader__line"
          d={CHART_LINE}
          pathLength="1"
          fill="none"
          stroke="url(#ar-loader-line)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="ar-loader__center">
        <div className="ar-loader__emblem">
          <span className="ar-loader__ring" aria-hidden="true" />
          <span className="ar-loader__pulse" aria-hidden="true" />
          <img
            className="ar-loader__logo"
            src="/images/alpharoom-logo.png"
            alt=""
            width="104"
            height="104"
          />
        </div>

        <div className="ar-loader__candles" aria-hidden="true">
          {CANDLES.map((candle, index) => (
            <span
              key={index}
              className={`ar-loader__candle ${candle.up ? 'is-up' : 'is-down'}`}
              style={{ '--h': `${candle.h}px`, '--d': `${index * 0.14}s` }}
            />
          ))}
        </div>

        <p className="ar-loader__text">
          Chargement<span className="ar-loader__dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>
        </p>
        <div className="ar-loader__bar" aria-hidden="true">
          <span />
        </div>
      </div>

      <div className="ar-loader__ticker" aria-hidden="true">
        <div className="ar-loader__ticker-track">
          {items.map((item, index) => (
            <span key={index} className="ar-loader__tick">
              <b>{item.s}</b>
              <em className={item.up ? 'is-up' : 'is-down'}>
                {item.up ? '▲' : '▼'} {item.c}
              </em>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
