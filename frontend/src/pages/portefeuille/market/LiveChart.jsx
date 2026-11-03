import { useMemo, useState } from "react";
import CandlestickChart from "../../../components/CandlestickChart/CandlestickChart.jsx";
import { INTERVALS, aggregateToCandles } from "../../../utils/candlestick.js";
import { formatClock, formatPercent, formatPrice } from "./format.js";

const WIDTH = 1000;
const HEIGHT = 320;
const PAD_Y = 0.12;

const MARKET_INTERVALS = ["1s", "5s", "15s", "1m", "5m"];

/**
 * Graphique de marché en chandeliers japonais (candlesticks),
 * avec repli en courbe continue (fitLines) pour les graphiques de capital ou de performance.
 */
export default function LiveChart({
  points = [],
  showSeconds = true,
  lines = [],
  fitLines = false,
  formatTime,
  emptyText = "Collecte des premiers prix…",
}) {
  const [hover, setHover] = useState(null);
  const [intervalKey, setIntervalKey] = useState("5s");
  const timeLabel = formatTime ?? ((t) => formatClock(t, showSeconds));

  const intervalSeconds = INTERVALS[intervalKey]?.seconds ?? 5;

  // ── Mode Chandeliers Japonais (Marché en direct /marche) ────────────────────
  const candles = useMemo(() => {
    if (fitLines || !points || points.length === 0) return [];
    return aggregateToCandles(points, intervalSeconds);
  }, [points, intervalSeconds, fitLines]);

  const priceLines = useMemo(() => {
    return lines.map((l) => ({
      price: l.price,
      label: l.label,
      color: l.color || "#d9b877",
    }));
  }, [lines]);

  // ── Mode Courbe de Capital (fitLines = true pour Cockpit / Performance) ──────
  const geometry = useMemo(() => {
    if (!fitLines || points.length < 2) return null;
    const prices = points.map((p) => p.price);
    let min = Math.min(...prices);
    let max = Math.max(...prices);
    for (const line of lines) {
      min = Math.min(min, line.price);
      max = Math.max(max, line.price);
    }
    const pad = (max - min || max * 0.0005) * PAD_Y;
    const low = min - pad;
    const high = max + pad;
    const t0 = points[0].t;
    const span = points.at(-1).t - t0 || 1;
    const xs = points.map((p) => ((p.t - t0) / span) * WIDTH);
    const ys = points.map((p) => HEIGHT - ((p.price - low) / (high - low)) * HEIGHT);
    const path = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
    return { xs, ys, path, low, high };
  }, [points, lines, fitLines]);

  if (!points || points.length < 2) {
    return <div className="lm-chart lm-chart--empty" data-testid="live-chart">{emptyText}</div>;
  }

  // Si on est en mode marché (chandeliers japonais)
  if (!fitLines) {
    const isUp = candles.length > 0
      ? candles[candles.length - 1].close >= candles[0].open
      : true;

    return (
      <div className={`lm-chart ${isUp ? "is-up" : "is-down"}`}>
        {/* Sélecteur d'intervalle pour chandeliers */}
        <div className="lm-intervals" role="group" aria-label="Intervalle de bougie">
          {MARKET_INTERVALS.map((key) => (
            <button
              key={key}
              type="button"
              className={intervalKey === key ? "is-active" : ""}
              aria-pressed={intervalKey === key}
              onClick={() => setIntervalKey(key)}
            >
              {key}
            </button>
          ))}
        </div>

        <div className="lm-chart-plot" data-testid="live-chart">
          <CandlestickChart
            candles={candles}
            height={HEIGHT}
            priceLines={priceLines}
            formatTime={(sec) => timeLabel(sec * 1000)}
            emptyText={emptyText}
            testId="live-chart-candles"
          />
          {lines.map((line) => (
            <span
              key={line.label}
              className="lm-ref-chip"
              style={{ position: "absolute", bottom: "10px", left: "10px", top: "auto", zIndex: 2 }}
            >
              {line.label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Mode courbe de capital
  if (!geometry) {
    return <div className="lm-chart lm-chart--empty" data-testid="live-chart">{emptyText}</div>;
  }

  const up = points.at(-1).price >= points[0].price;
  const { xs, ys, path, low, high } = geometry;
  const area = `${path} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`;
  const lastIndex = points.length - 1;
  const active = hover ?? lastIndex;
  const gridValues = [0.2, 0.5, 0.8].map((ratio) => high - (high - low) * ratio);
  const yPercent = (price) => (1 - (price - low) / (high - low)) * 100;

  const onMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const target = ratio * WIDTH;
    let best = 0;
    for (let i = 1; i < xs.length; i += 1) {
      if (Math.abs(xs[i] - target) < Math.abs(xs[best] - target)) best = i;
    }
    setHover(best);
  };

  return (
    <div className={`lm-chart ${up ? "is-up" : "is-down"}`}>
      <div
        className="lm-chart-plot"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        data-testid="live-chart"
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label="Évolution du prix en direct">
          <defs>
            <linearGradient id="lm-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {gridValues.map((value) => (
            <line key={value} x1="0" x2={WIDTH} y1={(yPercent(value) / 100) * HEIGHT} y2={(yPercent(value) / 100) * HEIGHT} className="lm-grid" />
          ))}
          {lines.map((line) => {
            const y = yPercent(line.price);
            if (y < 0 || y > 100) return null;
            return (
              <line key={line.label} x1="0" x2={WIDTH} y1={(y / 100) * HEIGHT} y2={(y / 100) * HEIGHT} className="lm-ref" />
            );
          })}
          <path d={area} fill="url(#lm-fill)" />
          <path d={path} className="lm-line" vectorEffect="non-scaling-stroke" />
        </svg>

        {gridValues.map((value) => (
          <span key={value} className="lm-axis-label" style={{ top: `${yPercent(value)}%` }}>
            {formatPrice(value)}
          </span>
        ))}

        {lines.map((line) => {
          const y = yPercent(line.price);
          const above = y < 0;
          const below = y > 100;
          const top = above ? 2 : below ? 98 : y;
          return (
            <span
              key={line.label}
              className={`lm-ref-chip${above || below ? " is-edge" : ""}`}
              style={{ top: `${top}%` }}
            >
              {above ? "▲ " : below ? "▼ " : ""}
              {line.label}
            </span>
          );
        })}

        <span
          className="lm-dot"
          style={{ left: `${(xs[active] / WIDTH) * 100}%`, top: `${(ys[active] / HEIGHT) * 100}%` }}
        />
        {hover !== null && (
          <>
            <span className="lm-cursor" style={{ left: `${(xs[active] / WIDTH) * 100}%` }} />
            <div
              className="lm-tooltip"
              style={{
                left: `${(xs[active] / WIDTH) * 100}%`,
                transform: `translateX(${xs[active] / WIDTH > 0.8 ? "-105%" : "8px"})`,
              }}
            >
              <strong>{formatPrice(points[active].price)} $</strong>
              <span>{timeLabel(points[active].t)}</span>
              <em className={points[active].price >= points[0].price ? "is-up" : "is-down"}>
                {formatPercent(((points[active].price - points[0].price) / points[0].price) * 100)}
              </em>
            </div>
          </>
        )}
      </div>
      <div className="lm-time">
        <span>{timeLabel(points[0].t)}</span>
        <span>{timeLabel(points.at(-1).t)}</span>
      </div>
    </div>
  );
}
