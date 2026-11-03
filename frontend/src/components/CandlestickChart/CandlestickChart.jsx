import { useEffect, useMemo, useRef, useState } from 'react';
import { ColorType, LineStyle, TickMarkType, createChart } from 'lightweight-charts';
import { formatPercent, formatPrice } from '../../pages/portefeuille/market/format.js';
import './CandlestickChart.css';

const GREEN = '#3fd1a0';
const RED = '#ff6b7a';
const REF_COLOR = '#d9b877';

/**
 * Composant de graphique en chandeliers japonais (candlestick chart).
 * Utilise Lightweight Charts (TradingView) pour un rendu fluide et performant,
 * avec repli automatique en SVG vectoriel si le contexte Canvas est absent (ex: jsdom).
 */
export default function CandlestickChart({
  candles = [],
  height = 280,
  priceLines = [],
  symbol = '',
  currency = '$',
  formatTime,
  emptyText = 'En attente de données…',
  testId = 'candlestick-chart',
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const linesRef = useRef([]);

  const [hoverData, setHoverData] = useState(null);
  const [useFallback, setUseFallback] = useState(false);

  // Dernière bougie disponible pour l'affichage par défaut (quand aucun survol)
  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const activeCandle = hoverData || latestCandle;

  // Tri des bougies par temps croissant (obligatoire pour lightweight-charts)
  const sortedCandles = useMemo(() => {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const copy = [...candles].sort((a, b) => a.time - b.time);
    // Élimine les doublons de timestamp consécutifs
    const unique = [];
    for (const c of copy) {
      if (unique.length > 0 && unique[unique.length - 1].time === c.time) {
        unique[unique.length - 1] = c;
      } else {
        unique.push(c);
      }
    }
    return unique;
  }, [candles]);

  // Initialisation de Lightweight Charts
  useEffect(() => {
    if (!containerRef.current) return;

    // Détection de l'environnement : si pas de Canvas getContext, repli immédiat sur SVG
    const testCanvas = document.createElement('canvas');
    if (!testCanvas.getContext) {
      setUseFallback(true);
      return;
    }

    try {
      const width = containerRef.current.clientWidth || 800;
      const chart = createChart(containerRef.current, {
        width,
        height,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#818b9e',
          fontFamily: '"JetBrains Mono", -apple-system, BlinkMacSystemFont, monospace',
          fontSize: 11,
        },
        localization: {
          locale: 'fr-FR',
          dateFormat: 'dd/MM/yyyy',
          timeFormatter: (time) => {
            if (typeof time === 'number') {
              if (time < 86400) {
                const min = Math.floor(time / 60);
                const sec = Math.floor(time % 60);
                return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
              }
              const d = new Date(time * 1000);
              const h = String(d.getHours()).padStart(2, '0');
              const m = String(d.getMinutes()).padStart(2, '0');
              const s = String(d.getSeconds()).padStart(2, '0');
              return `${h}:${m}:${s}`;
            }
            return '';
          },
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
        },
        crosshair: {
          vertLine: { color: 'rgba(255, 255, 255, 0.25)', width: 1, style: LineStyle.Dashed },
          horzLine: { color: 'rgba(255, 255, 255, 0.25)', width: 1, style: LineStyle.Dashed },
        },
        timeScale: {
          borderColor: 'rgba(255, 255, 255, 0.08)',
          timeVisible: true,
          secondsVisible: true,
          fixLeftEdge: true,
          fixRightEdge: true,
          tickMarkFormatter: (time, tickMarkType) => {
            if (typeof time === 'number') {
              if (time < 86400) {
                const min = Math.floor(time / 60);
                const sec = Math.floor(time % 60);
                return sec !== 0 ? `${min}:${String(sec).padStart(2, '0')}` : `${min}m`;
              }
              const d = new Date(time * 1000);
              const h = String(d.getHours()).padStart(2, '0');
              const m = String(d.getMinutes()).padStart(2, '0');
              const s = String(d.getSeconds()).padStart(2, '0');

              if (tickMarkType === TickMarkType.TimeWithSeconds) {
                return `${h}:${m}:${s}`;
              }
              if (tickMarkType === TickMarkType.Time) {
                return `${h}:${m}`;
              }
              if (tickMarkType === TickMarkType.DayOfMonth) {
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                return `${day}/${month}`;
              }
              if (tickMarkType === TickMarkType.Month) {
                const month = String(d.getMonth() + 1).padStart(2, '0');
                return `${month}/${d.getFullYear()}`;
              }
              if (tickMarkType === TickMarkType.Year) {
                return `${d.getFullYear()}`;
              }
              return `${h}:${m}`;
            }
            if (time && typeof time === 'object') {
              return `${String(time.day).padStart(2, '0')}/${String(time.month).padStart(2, '0')}`;
            }
            return null;
          },
        },
        rightPriceScale: {
          borderColor: 'rgba(255, 255, 255, 0.08)',
          scaleMargins: { top: 0.12, bottom: 0.12 },
        },
        handleScale: true,
        handleScroll: true,
      });

      const series = chart.addCandlestickSeries({
        upColor: GREEN,
        downColor: RED,
        borderVisible: false,
        wickUpColor: GREEN,
        wickDownColor: RED,
      });

      chart.subscribeCrosshairMove((param) => {
        if (!param || !param.time || !param.seriesData) {
          setHoverData(null);
          return;
        }
        const data = param.seriesData.get(series);
        if (data && Number.isFinite(data.close)) {
          setHoverData(data);
        } else {
          setHoverData(null);
        }
      });

      chartRef.current = chart;
      seriesRef.current = series;

      // Redimensionnement automatique
      const ro = new ResizeObserver((entries) => {
        if (!entries || entries.length === 0) return;
        const cr = entries[0].contentRect;
        if (cr.width > 0 && chartRef.current) {
          chartRef.current.applyOptions({ width: cr.width, height });
        }
      });
      ro.observe(containerRef.current);

      return () => {
        ro.disconnect();
        chart.remove();
        chartRef.current = null;
        seriesRef.current = null;
      };
    } catch {
      setUseFallback(true);
    }
  }, [height]);

  // Mise à jour des données dans Lightweight Charts
  useEffect(() => {
    if (!seriesRef.current || sortedCandles.length === 0) return;
    try {
      seriesRef.current.setData(sortedCandles);
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    } catch {
      // Si une erreur de données survient, on bascule en sécurité
      setUseFallback(true);
    }
  }, [sortedCandles]);

  // Mise à jour des lignes de repère (prix d'achat moyen, lignes de référence)
  useEffect(() => {
    if (!seriesRef.current) return;
    // Nettoie les anciennes lignes
    for (const line of linesRef.current) {
      try {
        seriesRef.current.removePriceLine(line);
      } catch {
        // Ignorer si déjà supprimée
      }
    }
    linesRef.current = [];

    // Crée les nouvelles lignes
    for (const pl of priceLines) {
      if (!pl || !Number.isFinite(pl.price) || pl.price <= 0) continue;
      try {
        const line = seriesRef.current.createPriceLine({
          price: pl.price,
          color: pl.color || REF_COLOR,
          lineWidth: 1,
          lineStyle: pl.lineStyle ?? LineStyle.Dashed,
          axisLabelVisible: true,
          title: pl.label || '',
        });
        linesRef.current.push(line);
      } catch {
        // Ignorer
      }
    }
  }, [priceLines]);

  // Formatage de l'horodatage pour le bandeau d'information (chiffres latins 0-9 garantis)
  const renderTime = (timeSec) => {
    if (!timeSec) return '—';
    if (formatTime) return formatTime(timeSec);
    const date = new Date(timeSec * 1000);
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const candleVariation = activeCandle && activeCandle.open > 0
    ? ((activeCandle.close - activeCandle.open) / activeCandle.open) * 100
    : 0;
  const isUp = activeCandle ? activeCandle.close >= activeCandle.open : true;

  if (sortedCandles.length === 0) {
    return <div className="cs-chart-empty" data-testid={testId}>{emptyText}</div>;
  }

  return (
    <div className="cs-chart-wrapper" data-testid={testId}>
      {/* Bandeau d'information OHLC interactif */}
      <div className="cs-ohlc-bar">
        {activeCandle ? (
          <>
            <span className="cs-ohlc-time">{renderTime(activeCandle.time)}</span>
            <span className="cs-ohlc-item">
              <em>O</em> {formatPrice(activeCandle.open)} {currency}
            </span>
            <span className="cs-ohlc-item">
              <em>H</em> {formatPrice(activeCandle.high)} {currency}
            </span>
            <span className="cs-ohlc-item">
              <em>L</em> {formatPrice(activeCandle.low)} {currency}
            </span>
            <span className="cs-ohlc-item">
              <em>C</em> {formatPrice(activeCandle.close)} {currency}
            </span>
            <span className={`cs-ohlc-var ${isUp ? 'is-up' : 'is-down'}`}>
              {formatPercent(candleVariation)}
            </span>
          </>
        ) : (
          <span className="cs-ohlc-idle">Survolez le graphique pour afficher les détails OHLC</span>
        )}
      </div>

      {/* Conteneur Lightweight Charts */}
      <div
        ref={containerRef}
        className="cs-chart-canvas-container"
        style={{ height: `${height}px`, display: useFallback ? 'none' : 'block' }}
      />

      {/* Rendu SVG vectoriel de repli pour jsdom ou environnements sans canvas */}
      {useFallback && (
        <SvgCandlestickFallback
          candles={sortedCandles}
          height={height}
          priceLines={priceLines}
          onHover={setHoverData}
        />
      )}
    </div>
  );
}

/** Rendu SVG vectoriel de chandeliers pour les tests jsdom et la robustesse */
function SvgCandlestickFallback({ candles, height, priceLines, onHover }) {
  const WIDTH = 900;
  const PAD_Y = 0.1;

  const geometry = useMemo(() => {
    if (!candles || candles.length === 0) return null;
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    let min = Math.min(...lows);
    let max = Math.max(...highs);
    const pad = (max - min || 1) * PAD_Y;
    const low = min - pad;
    const high = max + pad;

    const count = candles.length;
    const candleWidth = Math.max(2, Math.min(18, (WIDTH / count) * 0.7));

    const items = candles.map((c, i) => {
      const cx = ((i + 0.5) / count) * WIDTH;
      const yHigh = height - ((c.high - low) / (high - low)) * height;
      const yLow = height - ((c.low - low) / (high - low)) * height;
      const yOpen = height - ((c.open - low) / (high - low)) * height;
      const yClose = height - ((c.close - low) / (high - low)) * height;
      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(1.5, Math.abs(yClose - yOpen));
      const up = c.close >= c.open;

      return {
        candle: c,
        cx,
        yHigh,
        yLow,
        bodyTop,
        bodyHeight,
        candleWidth,
        up,
      };
    });

    return { items, low, high };
  }, [candles, height]);

  if (!geometry) return null;

  return (
    <div className="cs-svg-fallback" style={{ height: `${height}px` }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
        onMouseLeave={() => onHover(null)}
      >
        {/* Lignes de repère horizontales */}
        {priceLines.map((pl, i) => {
          if (!pl || !pl.price) return null;
          const y = height - ((pl.price - geometry.low) / (geometry.high - geometry.low)) * height;
          if (y < 0 || y > height) return null;
          return (
            <line
              key={i}
              x1="0"
              x2={WIDTH}
              y1={y}
              y2={y}
              stroke={pl.color || REF_COLOR}
              strokeWidth="1.2"
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Chandeliers (mèches fines + corps de bougie) */}
        {geometry.items.map((item, idx) => (
          <g
            key={idx}
            className="cs-candle-group"
            onMouseEnter={() => onHover(item.candle)}
          >
            {/* Mèche haute et basse (fine, 1px) */}
            <line
              x1={item.cx}
              x2={item.cx}
              y1={item.yHigh}
              y2={item.yLow}
              stroke={item.up ? GREEN : RED}
              strokeWidth="1.2"
            />
            {/* Corps de la bougie */}
            <rect
              x={item.cx - item.candleWidth / 2}
              y={item.bodyTop}
              width={item.candleWidth}
              height={item.bodyHeight}
              fill={item.up ? GREEN : RED}
              rx="1"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
