import { useMemo } from 'react';
import { hashSeed, mulberry32 } from '../../utils/seededRandom.js';
import './HeroTerminal.css';

// Aperçu illustratif d'un poste de trading (données fictives, graine fixe).
// Il remplace les bulles flottantes du hero : montre le produit au premier regard.
const W = 540;
const H = 210;
const PAD_R = 54;
const COUNT = 46;

function buildCandles() {
  const rand = mulberry32(hashSeed('alpharoom-hero-terminal'));
  const candles = [];
  let price = 2662;
  for (let i = 0; i < COUNT; i += 1) {
    const open = price;
    const drift = 0.55 + (i > 30 ? 0.6 : 0);
    const close = open + (rand() - 0.42) * 9 + drift * 0.35;
    const high = Math.max(open, close) + rand() * 4.5;
    const low = Math.min(open, close) - rand() * 4.5;
    candles.push({ open, close, high, low });
    price = close;
  }
  return candles;
}

const BOOK = [
  { p: '2 686,70', w: 0.62, side: 'ask' },
  { p: '2 686,10', w: 0.44, side: 'ask' },
  { p: '2 685,70', w: 0.28, side: 'ask' },
  { p: '2 685,10', w: 0.36, side: 'bid' },
  { p: '2 684,60', w: 0.52, side: 'bid' },
  { p: '2 684,00', w: 0.7, side: 'bid' },
];

export default function HeroTerminal() {
  const { candles, y, last, step } = useMemo(() => {
    const list = buildCandles();
    const lo = Math.min(...list.map((c) => c.low));
    const hi = Math.max(...list.map((c) => c.high));
    const span = hi - lo || 1;
    const scale = (value) => 14 + (1 - (value - lo) / span) * (H - 34);
    return {
      candles: list,
      y: scale,
      last: list[list.length - 1].close,
      step: (W - PAD_R - 12) / COUNT,
    };
  }, []);

  const lastY = y(last);

  return (
    <div className="ar-term" role="img" aria-label="Aperçu illustratif d'un poste de trading AlphaRoom">
      <div className="ar-term__bar">
        <span className="ar-term__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="ar-term__tab">Marché</span>
        <span className="ar-term__badge">Aperçu illustratif</span>
      </div>

      <div className="ar-term__head">
        <div>
          <span className="ar-term__label">Dernier prix</span>
          <div className="ar-term__price ui-num">2 685,40</div>
        </div>
        <span className="ar-term__delta ui-num">▲ +0,62 %</span>
        <div className="ar-term__ranges" aria-hidden="true">
          <span>1m</span>
          <span className="is-on">5m</span>
          <span>1h</span>
        </div>
      </div>

      <svg className="ar-term__chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {[0.2, 0.4, 0.6, 0.8].map((t) => (
          <line key={t} x1="0" x2={W - PAD_R} y1={H * t} y2={H * t} className="ar-term__grid" />
        ))}
        {candles.map((c, i) => {
          const up = c.close >= c.open;
          const x = 8 + i * step + step / 2;
          const top = y(Math.max(c.open, c.close));
          const bottom = y(Math.min(c.open, c.close));
          return (
            <g key={i} className={up ? 'is-up' : 'is-down'}>
              <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} />
              <rect x={x - step * 0.3} y={top} width={step * 0.6} height={Math.max(bottom - top, 1.4)} rx="1" />
            </g>
          );
        })}
        <line x1="0" x2={W - PAD_R} y1={lastY} y2={lastY} className="ar-term__last" />
        <rect x={W - PAD_R + 2} y={lastY - 9} width={PAD_R - 4} height="18" rx="4" className="ar-term__tag" />
        <text x={W - PAD_R / 2} y={lastY + 4} textAnchor="middle" className="ar-term__tagtext">
          2685,4
        </text>
      </svg>

      <div className="ar-term__foot">
        <dl className="ar-term__stats">
          <div>
            <dt>Valeur du portefeuille</dt>
            <dd className="ui-num">101 860 $</dd>
          </div>
          <div>
            <dt>P&amp;L latent</dt>
            <dd className="ui-num ui-up">+1 860 $</dd>
          </div>
          <div>
            <dt>Positions</dt>
            <dd className="ui-num">2</dd>
          </div>
        </dl>
        <ul className="ar-term__book" aria-hidden="true">
          {BOOK.map((row) => (
            <li key={row.p} className={`is-${row.side}`}>
              <i style={{ width: `${row.w * 100}%` }} />
              <span className="ui-num">{row.p}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
