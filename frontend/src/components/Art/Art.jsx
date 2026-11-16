import { initialsOf } from '../../utils/initials.js';
import { hashSeed, mulberry32 } from '../../utils/seededRandom.js';
import './Art.css';

// Visuels vectoriels d'AlphaRoom : ils remplacent les photos et illustrations
// importées. Tout est dessiné en SVG (net à toutes les tailles, quelques Ko),
// dans la couleur d'accent de l'élément (`color` → currentColor), sur le fond
// bleu nuit du thème. Les dessins sont déterministes (graine fixe).

const BG = '#070b16';
const UP = '#3fd1a0';
const DOWN = '#ff6b7a';

// Cadre commun : fond bleu nuit, halo d'accent et fine grille.
function Frame({ id, color, w, h, label, className, children }) {
  return (
    <svg
      className={`ar-art ${className ?? ''}`.trim()}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label}
      style={{ color }}
    >
      <defs>
        <radialGradient id={`${id}-glow`} cx="72%" cy="18%" r="90%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.34" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
        <pattern id={`${id}-grid`} width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="currentColor" strokeOpacity="0.08" />
        </pattern>
      </defs>
      <rect width={w} height={h} fill={BG} />
      <rect width={w} height={h} fill={`url(#${id}-grid)`} />
      <rect width={w} height={h} fill={`url(#${id}-glow)`} />
      {children}
    </svg>
  );
}

// Suite de bougies japonaises déterministe.
function buildCandles(seed, count, drift) {
  const rand = mulberry32(hashSeed(seed));
  const candles = [];
  let price = 100;
  for (let i = 0; i < count; i += 1) {
    const open = price;
    const close = open + (rand() - 0.42) * 8 + drift;
    candles.push({
      open,
      close,
      high: Math.max(open, close) + rand() * 4,
      low: Math.min(open, close) - rand() * 4,
    });
    price = close;
  }
  return candles;
}

function CandleChart({ seed }) {
  const count = 18;
  const candles = buildCandles(seed, count, 0.9);
  const lo = Math.min(...candles.map((c) => c.low));
  const hi = Math.max(...candles.map((c) => c.high));
  const y = (value) => 300 - ((value - lo) / (hi - lo || 1)) * 230;
  const x = (i) => 56 + i * 31;

  // Moyenne mobile sur 4 bougies.
  const average = candles.map((_, i) => {
    const slice = candles.slice(Math.max(0, i - 3), i + 1);
    return slice.reduce((sum, c) => sum + c.close, 0) / slice.length;
  });
  const maPath = average.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(v).toFixed(1)}`).join(' ');

  return (
    <g>
      {candles.map((c, i) => {
        const up = c.close >= c.open;
        const tone = up ? UP : DOWN;
        const top = y(Math.max(c.open, c.close));
        const height = Math.max(4, Math.abs(y(c.open) - y(c.close)));
        return (
          <g key={`${seed}-${x(i)}`}>
            <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={tone} strokeWidth="2" strokeOpacity="0.85" />
            <rect x={x(i) - 8} y={top} width="16" height={height} rx="3" fill={tone} fillOpacity="0.9" />
          </g>
        );
      })}
      <path
        d={maPath}
        pathLength="1"
        className="ar-art__draw"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

// Mini carnet d'ordres : offres (rouge) au-dessus, demandes (vert) en dessous.
function OrderBookBars({ seed }) {
  const rand = mulberry32(hashSeed(seed));
  const asks = Array.from({ length: 5 }, (_, n) => ({ n, width: 30 + rand() * 90 }));
  const bids = Array.from({ length: 5 }, (_, n) => ({ n, width: 30 + rand() * 90 }));
  return (
    <g>
      {asks.map(({ n, width }) => (
        <rect key={`ask-${n}`} x={756 - width} y={96 + n * 20} width={width} height="12" rx="6" fill={DOWN} fillOpacity={0.35 + n * 0.1} />
      ))}
      <line x1="620" x2="756" y1="206" y2="206" stroke="currentColor" strokeOpacity="0.5" strokeDasharray="4 5" />
      {bids.map(({ n, width }) => (
        <rect key={`bid-${n}`} x={756 - width} y={216 + n * 20} width={width} height="12" rx="6" fill={UP} fillOpacity={0.85 - n * 0.1} />
      ))}
    </g>
  );
}

// Salle de simulation : un meneur de jeu au centre, des participants autour, et un choc de prix.
function RoomScene() {
  const seats = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
    return { n: i, cx: 400 + Math.cos(angle) * 170, cy: 175 + Math.sin(angle) * 100, hot: i === 2 || i === 5 };
  });
  return (
    <g>
      {seats.map((seat) => (
        <line key={`link-${seat.n}`} x1="400" y1="175" x2={seat.cx} y2={seat.cy} stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.5" />
      ))}
      {seats.map((seat) => (
        <g key={`seat-${seat.n}`}>
          <circle cx={seat.cx} cy={seat.cy} r="15" fill={BG} stroke="currentColor" strokeOpacity={seat.hot ? 1 : 0.5} strokeWidth="2" />
          <circle cx={seat.cx} cy={seat.cy} r="6" fill="currentColor" fillOpacity={seat.hot ? 0.95 : 0.4} className={seat.hot ? 'ar-art__pulse' : undefined} />
        </g>
      ))}
      <circle cx="400" cy="175" r="58" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeDasharray="5 7" />
      <circle cx="400" cy="175" r="40" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="2.5" />
      <rect x="388" y="160" width="9" height="30" rx="3" fill="currentColor" />
      <rect x="404" y="160" width="9" height="30" rx="3" fill="currentColor" />
      {/* courbe de prix avec choc puis rebond */}
      <path
        d="M70 360 L170 352 L250 358 L330 346 L390 342 L420 396 L450 372 L520 380 L600 350 L730 338"
        pathLength="1"
        className="ar-art__draw"
        fill="none"
        stroke={DOWN}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M410 322 L396 350 L412 350 L402 378" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

const MODULE_LABELS = {
  portefeuille: 'Illustration : bougies de marché, moyenne mobile et carnet d’ordres',
  'game-room': 'Illustration : salle de simulation avec meneur de jeu, participants et choc de prix',
};

// Illustration d'une carte de module (home page). Ratio 16/9.
export function ModuleArt({ id, color, className }) {
  const label = MODULE_LABELS[id] ?? 'Illustration du module';
  return (
    <Frame id={`mod-${id}`} color={color} w={800} h={450} label={label} className={className}>
      {id === 'game-room' ? (
        <RoomScene />
      ) : (
        <>
          <CandleChart seed={id} />
          <OrderBookBars seed={id} />
        </>
      )}
    </Frame>
  );
}

function ExplainBars() {
  const factors = [0.42, 0.27, -0.18, -0.06];
  return (
    <g>
      <line x1="200" x2="200" y1="44" y2="190" stroke="currentColor" strokeOpacity="0.5" />
      {factors.map((weight, index) => {
        const width = Math.abs(weight) * 300;
        return (
          <rect
            key={`factor-${index}`}
            x={weight >= 0 ? 200 : 200 - width}
            y={52 + index * 34}
            width={width}
            height="22"
            rx="11"
            fill="currentColor"
            fillOpacity={weight >= 0 ? 0.9 : 0.55}
          />
        );
      })}
    </g>
  );
}

function ShieldCheck() {
  return (
    <g>
      <circle cx="200" cy="134" r="110" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeDasharray="3 9" />
      <path
        d="M200 48 L272 76 V136 C272 182 240 212 200 230 C160 212 128 182 128 136 V76 Z"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M168 136 L194 162 L236 108" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" pathLength="1" className="ar-art__draw" />
    </g>
  );
}

function Bulb() {
  const rays = Array.from({ length: 9 }, (_, n) => {
    const angle = Math.PI + (n / 8) * Math.PI;
    return {
      n,
      x1: 200 + Math.cos(angle) * 84,
      y1: 130 + Math.sin(angle) * 84,
      x2: 200 + Math.cos(angle) * 104,
      y2: 130 + Math.sin(angle) * 104,
    };
  });
  return (
    <g>
      {rays.map((ray) => (
        <line key={`ray-${ray.n}`} x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2} stroke="currentColor" strokeOpacity="0.6" strokeWidth="3" strokeLinecap="round" />
      ))}
      <circle cx="200" cy="130" r="58" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="3.5" className="ar-art__pulse" />
      <rect x="176" y="190" width="48" height="12" rx="6" fill="currentColor" fillOpacity="0.8" />
      <rect x="184" y="208" width="32" height="10" rx="5" fill="currentColor" fillOpacity="0.55" />
      <rect x="170" y="130" width="12" height="26" rx="4" fill="currentColor" fillOpacity="0.9" />
      <rect x="194" y="108" width="12" height="48" rx="4" fill="currentColor" fillOpacity="0.9" />
      <rect x="218" y="122" width="12" height="34" rx="4" fill="currentColor" fillOpacity="0.9" />
    </g>
  );
}

const PRINCIPLE_LABELS = {
  transparente: 'Illustration : les facteurs qui pèsent dans une décision, en barres pour et contre',
  verifiable: 'Illustration : un bouclier avec une coche de validation',
  pedagogique: 'Illustration : une ampoule qui éclaire un graphique',
};

// Illustration d'une promesse de l'IA (home page, section IA). Carte quasi carrée, texte en bas.
export function PrincipleArt({ id, color, className }) {
  const label = PRINCIPLE_LABELS[id] ?? 'Illustration de l’IA d’AlphaRoom';
  return (
    <Frame id={`ai-${id}`} color={color} w={400} h={420} label={label} className={className}>
      {id === 'verifiable' && <ShieldCheck />}
      {id === 'pedagogique' && <Bulb />}
      {id !== 'verifiable' && id !== 'pedagogique' && <ExplainBars />}
    </Frame>
  );
}

// Courbe de prix d'illustration d'un actif, tendance haussière ou baissière.
function Sparkline({ seed, up }) {
  const rand = mulberry32(hashSeed(seed));
  const points = 40;
  const values = [];
  let v = 0;
  for (let i = 0; i < points; i += 1) {
    v += (rand() - 0.5) * 2 + (up ? 0.18 : -0.18);
    values.push(v);
  }
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const coords = values.map((val, i) => [(i / (points - 1)) * 560, 330 - ((val - lo) / (hi - lo || 1)) * 130]);
  const line = coords.map(([cx, cy], i) => `${i === 0 ? 'M' : 'L'}${cx.toFixed(1)} ${cy.toFixed(1)}`).join(' ');
  return (
    <g>
      <path d={`${line} L560 350 L0 350 Z`} fill="currentColor" fillOpacity="0.12" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength="1" className="ar-art__draw" />
    </g>
  );
}

// Fond d'un onglet de marché : pastille du symbole + courbe de prix.
export function MarketArt({ asset, className }) {
  const { id, name, glyph, accent, up } = asset;
  return (
    <Frame id={`mk-${id}`} color={accent} w={560} h={350} label={`Pastille et courbe de ${name}`} className={className}>
      <Sparkline seed={id} up={up} />
      <circle cx="458" cy="92" r="58" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="458" cy="92" r="72" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeDasharray="3 8" />
      <text
        x="458"
        y={glyph.length > 2 ? 104 : 108}
        textAnchor="middle"
        fontFamily="'JetBrains Mono', ui-monospace, monospace"
        fontSize={glyph.length > 2 ? 30 : 40}
        fontWeight="700"
        fill="currentColor"
      >
        {glyph}
      </text>
    </Frame>
  );
}

// Avatar d'un membre de l'équipe : initiales dans des anneaux de sa couleur.
export function MemberArt({ name, color, className }) {
  return (
    <Frame id={`mb-${hashSeed(name)}`} color={color} w={640} h={800} label={`Avatar de ${name}`} className={className}>
      {[250, 190, 134].map((r, i) => (
        <circle key={r} cx="320" cy="300" r={r} fill="none" stroke="currentColor" strokeOpacity={0.1 + i * 0.07} />
      ))}
      <circle cx="320" cy="300" r="98" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="3" />
      <text
        x="320"
        y="328"
        textAnchor="middle"
        fontFamily="'Space Grotesk', system-ui, sans-serif"
        fontSize="84"
        fontWeight="700"
        fill="currentColor"
      >
        {initialsOf(name)}
      </text>
    </Frame>
  );
}
