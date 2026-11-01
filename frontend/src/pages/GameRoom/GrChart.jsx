import React, { useMemo, useState } from 'react';
import { formatPrice } from '../../data/roomAssets.js';

const WIDTH = 900;
const HEIGHT = 280;

export default function GrChart({
  series = [],
  averageBuyPrice = null,
  currentPrice = 0,
  events = [],
  symbol = 'XAU/USD',
  currency = '$US',
  totalSeconds = 1800,
}) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const totalMinutes = Math.max(1, Math.round((totalSeconds || 1800) / 60));

  const { points, xs, ys, path, area, minPrice, maxPrice, isUp } = useMemo(() => {
    if (!series || series.length < 2) {
      return { points: [], xs: [], ys: [], path: '', area: '', minPrice: 2600, maxPrice: 2750, isUp: true };
    }

    const prices = series.map((p) => p.price);
    if (averageBuyPrice) prices.push(averageBuyPrice);

    let min = Math.min(...prices);
    let max = Math.max(...prices);
    const pad = (max - min || 10) * 0.15;
    const low = min - pad;
    const high = max + pad;

    const t0 = series[0].t;
    const tEnd = Math.max(series[series.length - 1].t, totalSeconds || 1800);
    const span = tEnd - t0 || 1;

    const xsArr = series.map((p) => ((p.t - t0) / span) * WIDTH);
    const ysArr = series.map((p) => HEIGHT - ((p.price - low) / (high - low)) * HEIGHT);

    const dPath = xsArr.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${ysArr[i].toFixed(1)}`).join(' ');
    const dArea = `${dPath} L${xsArr[xsArr.length - 1].toFixed(1)} ${HEIGHT} L0 ${HEIGHT} Z`;

    const up = series[series.length - 1].price >= series[0].price;

    return {
      points: series,
      xs: xsArr,
      ys: ysArr,
      path: dPath,
      area: dArea,
      minPrice: low,
      maxPrice: high,
      isUp: up,
    };
  }, [series, averageBuyPrice, totalSeconds]);

  const activeIndex = hoverIndex !== null ? hoverIndex : points.length - 1;
  const activePoint = points[activeIndex];

  const avgPriceY = useMemo(() => {
    if (!averageBuyPrice || minPrice === maxPrice) return null;
    return HEIGHT - ((averageBuyPrice - minPrice) / (maxPrice - minPrice)) * HEIGHT;
  }, [averageBuyPrice, minPrice, maxPrice]);

  const onMouseMove = (event) => {
    if (!points.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const targetX = ratio * WIDTH;

    let best = 0;
    for (let i = 1; i < xs.length; i++) {
      if (Math.abs(xs[i] - targetX) < Math.abs(xs[best] - targetX)) {
        best = i;
      }
    }
    setHoverIndex(best);
  };

  return (
    <div className="gr-chart-card">
      <div className="gr-chart-card__head">
        <div className="gr-chart-card__title-group">
          <span className="gr-eyebrow">GRAPHIQUE DE SÉANCE · {symbol}</span>
          <h3>Cotation simulée de séance</h3>
        </div>
        <div className="gr-chart-card__legend">
          <span className="gr-legend-item">
            <i className="gr-legend-color gr-legend-color--market" /> Cours en direct
          </span>
          {averageBuyPrice && (
            <span className="gr-legend-item">
              <i className="gr-legend-color gr-legend-color--avg" /> Achat moyen ({formatPrice(averageBuyPrice, symbol)} {currency})
            </span>
          )}
        </div>
      </div>

      <div
        className="gr-chart-viewport"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="grChartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isUp ? '#3fd1a0' : '#ff6b7a'} stopOpacity="0.25" />
              <stop offset="100%" stopColor={isUp ? '#3fd1a0' : '#ff6b7a'} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Lignes de repère aux tiers de la séance */}
          <line x1={WIDTH / 3} y1="0" x2={WIDTH / 3} y2={HEIGHT} className="gr-chart-grid" strokeDasharray="3 3" />
          <line x1={(WIDTH * 2) / 3} y1="0" x2={(WIDTH * 2) / 3} y2={HEIGHT} className="gr-chart-grid" strokeDasharray="3 3" />

          {/* Tracé de la courbe et zone sous la courbe */}
          {area && <path d={area} fill="url(#grChartGrad)" />}
          {path && (
            <path
              d={path}
              fill="none"
              stroke={isUp ? '#3fd1a0' : '#ff6b7a'}
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Ligne d'achat moyen */}
          {avgPriceY !== null && avgPriceY >= 0 && avgPriceY <= HEIGHT && (
            <line
              x1="0"
              y1={avgPriceY}
              x2={WIDTH}
              y2={avgPriceY}
              stroke="#d9b877"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          )}
        </svg>

        {/* Curseur et point actif */}
        {activePoint && xs[activeIndex] !== undefined && (
          <>
            <span
              className="gr-chart-cursor"
              style={{ left: `${(xs[activeIndex] / WIDTH) * 100}%` }}
            />
            <span
              className="gr-chart-dot"
              style={{
                left: `${(xs[activeIndex] / WIDTH) * 100}%`,
                top: `${(ys[activeIndex] / HEIGHT) * 100}%`,
                backgroundColor: isUp ? '#3fd1a0' : '#ff6b7a',
              }}
            />
            <div
              className="gr-chart-tooltip"
              style={{
                left: `${Math.min(82, Math.max(10, (xs[activeIndex] / WIDTH) * 100))}%`,
              }}
            >
              <strong>{formatPrice(activePoint.price, symbol)} {currency}</strong>
              <span>Minute {(activePoint.t / 60).toFixed(1)} / {totalMinutes}</span>
            </div>
          </>
        )}
      </div>

      <div className="gr-chart-timeline">
        <span>Min 0 · Départ {series[0] ? formatPrice(series[0].price, symbol) : '—'} {currency}</span>
        {[0.25, 0.5, 0.75].map((ratio) => (
          <span key={ratio}>Min {Math.round(totalMinutes * ratio)}</span>
        ))}
        <span>
          Min {totalMinutes} · Clôture{' '}
          {currentPrice ? `${formatPrice(currentPrice, symbol)} ${currency}` : '—'}
        </span>
      </div>
    </div>
  );
}
