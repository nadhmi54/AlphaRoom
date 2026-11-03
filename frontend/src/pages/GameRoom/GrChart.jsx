import { useMemo, useState } from 'react';
import { formatPrice } from '../../data/roomAssets.js';
import CandlestickChart from '../../components/CandlestickChart/CandlestickChart.jsx';
import { INTERVALS, aggregateToCandles, updateCandlesWithTick } from '../../utils/candlestick.js';

const AVAILABLE_INTERVALS = ['5s', '15s', '1m', '5m'];

export default function GrChart({
  series = [],
  averageBuyPrice = null,
  currentPrice = 0,
  // eslint-disable-next-line no-unused-vars
  events = [],
  symbol = 'XAU/USD',
  currency = '$US',
  totalSeconds = 1800,
}) {
  const [intervalKey, setIntervalKey] = useState('5s');
  const totalMinutes = Math.max(1, Math.round((totalSeconds || 1800) / 60));

  const intervalSeconds = INTERVALS[intervalKey]?.seconds ?? 5;

  // Agrégation des ticks en chandeliers pour l'intervalle sélectionné
  const candles = useMemo(() => {
    let list = aggregateToCandles(series, intervalSeconds);
    // Mise à jour temps réel de la dernière bougie avec le cours en direct
    if (currentPrice && series.length > 0) {
      const lastT = series[series.length - 1].t;
      list = updateCandlesWithTick(list, { t: lastT, price: currentPrice }, intervalSeconds);
    }
    return list;
  }, [series, currentPrice, intervalSeconds]);

  // Ligne de repère pour l'achat moyen
  const priceLines = useMemo(() => {
    if (!averageBuyPrice) return [];
    return [
      {
        price: averageBuyPrice,
        label: `Achat moyen (${formatPrice(averageBuyPrice, symbol)} ${currency})`,
        color: '#d9b877',
      },
    ];
  }, [averageBuyPrice, symbol, currency]);

  const formatSimTime = (timeSec) => `Min ${(timeSec / 60).toFixed(1)} / ${totalMinutes}`;

  return (
    <div className="gr-chart-card">
      <div className="gr-chart-card__head">
        <div className="gr-chart-card__title-group">
          <span className="gr-eyebrow">CHANDELIERS JAPONAIS · {symbol}</span>
          <h3>Cotation simulée de séance (OHLC)</h3>
        </div>

        {/* Sélecteur d'intervalle */}
        <div className="gr-intervals" role="group" aria-label="Intervalle de bougie">
          {AVAILABLE_INTERVALS.map((key) => (
            <button
              key={key}
              type="button"
              className={intervalKey === key ? 'is-active' : ''}
              aria-pressed={intervalKey === key}
              onClick={() => setIntervalKey(key)}
            >
              {key}
            </button>
          ))}
        </div>

        <div className="gr-chart-card__legend">
          <span className="gr-legend-item">
            <i className="gr-legend-color gr-legend-color--market" /> Hausse / Baisse
          </span>
          {averageBuyPrice && (
            <span className="gr-legend-item">
              <i className="gr-legend-color gr-legend-color--avg" /> Achat moyen ({formatPrice(averageBuyPrice, symbol)} {currency})
            </span>
          )}
        </div>
      </div>

      <div className="gr-chart-viewport">
        <CandlestickChart
          candles={candles}
          height={260}
          priceLines={priceLines}
          symbol={symbol}
          currency={currency}
          formatTime={formatSimTime}
          emptyText="Collecte des premières cotations de séance…"
          testId="gr-candlestick-chart"
        />
      </div>

      <div className="gr-chart-timeline">
        <span>Min 0 · Départ {series[0] ? formatPrice(series[0].price, symbol) : '—'} {currency}</span>
        <span>
          Min {totalMinutes} · Clôture{' '}
          {currentPrice ? `${formatPrice(currentPrice, symbol)} ${currency}` : '—'}
        </span>
      </div>
    </div>
  );
}
