import { useEffect, useMemo, useRef, useState } from "react";
import LiveChart from "./LiveChart.jsx";
import QuickTrade from "./QuickTrade.jsx";
import Sparkline from "./Sparkline.jsx";
import { formatPercent, formatPrice, trend } from "./format.js";
import { RANGES } from "./useLiveMarket.js";
import "./LiveMarketPanel.css";

/** Prix qui clignote en vert ou en rouge quand il change. */
function usePriceFlash(price) {
  const previous = useRef(price);
  const [flash, setFlash] = useState("");
  useEffect(() => {
    if (price === undefined || previous.current === undefined || price === previous.current) {
      previous.current = price;
      return undefined;
    }
    setFlash(price > previous.current ? "is-up" : "is-down");
    previous.current = price;
    const timer = window.setTimeout(() => setFlash(""), 450);
    return () => window.clearTimeout(timer);
  }, [price]);
  return flash;
}

function SourceBadge({ source }) {
  return source === "live" ? (
    <span className="lm-badge lm-badge--live" title="Prix réel reçu du marché">
      <i aria-hidden="true" /> En direct
    </span>
  ) : (
    <span className="lm-badge lm-badge--sim" title="Marché fermé ou flux indisponible : prix simulé autour du dernier prix réel">
      Simulé
    </span>
  );
}

const signed = (value) =>
  `${value > 0 ? "+" : ""}${new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value)}`;

/**
 * Scène « marché » : cartes des actifs (prix + mini-courbe qui bougent chaque
 * seconde), grand graphique de l'actif choisi avec ta ligne d'achat moyen, et
 * l'ordre rapide. Le mode plein écran (touche F) isole le graphique.
 */
export default function LiveMarketPanel({
  market,
  symbol,
  onSymbolChange,
  range,
  onRangeChange,
  assets = [],
  account,
  onExecuted,
  onToast,
  focus = false,
  onFocusChange,
}) {
  const { quotes, series, error, loadingSeries } = market;
  const selected = quotes.find((quote) => quote.symbol === symbol);
  const asset = assets.find((item) => item.symbol === symbol);
  const flash = usePriceFlash(selected?.price);

  const first = series[0]?.price;
  const rangeChange = first && selected ? ((selected.price - first) / first) * 100 : 0;

  // Ta position sur cet actif : ligne « prix d'achat moyen » sur la courbe,
  // avec le gain ou la perte en temps réel au prix du marché.
  const position = account?.positions?.find((item) => item.symbol === symbol && item.quantity > 0);
  const lines = useMemo(() => {
    if (!position || !selected) return [];
    const pnl = (selected.price - position.averagePrice) * position.quantity;
    return [{ price: position.averagePrice, label: `Ton achat moyen ${formatPrice(position.averagePrice)} · ${signed(pnl)}` }];
  }, [position, selected]);

  return (
    <section className={`lm-panel${focus ? " is-focus" : ""}`} aria-label="Marché en direct">
      <ul className="lm-assets" aria-label="Actifs">
        {quotes.length === 0 && <li className="lm-empty">Chargement des prix…</li>}
        {quotes.map((quote) => (
          <li key={quote.symbol}>
            <button
              type="button"
              className={quote.symbol === symbol ? "is-selected" : ""}
              aria-pressed={quote.symbol === symbol}
              onClick={() => onSymbolChange(quote.symbol)}
            >
              <span className="lm-asset-top">
                <strong>{quote.symbol}</strong>
                <i className={quote.source === "live" ? "is-live" : "is-sim"} aria-hidden="true" />
              </span>
              <small>{quote.name}</small>
              <Sparkline values={quote.spark} up={quote.changePercent >= 0} />
              <span className="lm-asset-bottom">
                <b>{formatPrice(quote.price)}</b>
                <em className={trend(quote.changePercent)}>{formatPercent(quote.changePercent)}</em>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <div className="lm-error" role="alert">
          {error}
        </div>
      )}

      <div className="lm-grid-main">
        <div className="lm-stage">
          <div className="lm-head">
            <div>
              <div className="lm-title">
                <h4>{selected?.name ?? symbol}</h4>
                <span className="lm-symbol">{symbol}</span>
                {selected && <SourceBadge source={selected.source} />}
              </div>
              <div className="lm-price-row">
                <strong className={`lm-price ${flash}`} data-testid="live-price">
                  {selected ? formatPrice(selected.price) : "—"}
                  <small> $US</small>
                </strong>
                <span className={`lm-change ${trend(rangeChange)}`}>
                  {formatPercent(rangeChange)} sur {RANGES[range].label}
                </span>
              </div>
            </div>
            <div className="lm-controls">
              <div className="lm-ranges" role="group" aria-label="Période">
                {Object.entries(RANGES).map(([key, item]) => (
                  <button
                    key={key}
                    type="button"
                    className={range === key ? "is-active" : ""}
                    aria-pressed={range === key}
                    onClick={() => onRangeChange(key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="lm-focus-btn"
                aria-pressed={focus}
                title={focus ? "Quitter le plein écran (Échap)" : "Plein écran (F)"}
                onClick={() => onFocusChange?.(!focus)}
              >
                {focus ? "Fermer ✕" : "Plein écran ⤢"}
              </button>
            </div>
          </div>

          {loadingSeries && series.length < 2 ? (
            <div className="lm-chart lm-chart--empty">Chargement de la courbe…</div>
          ) : (
            <LiveChart points={series} showSeconds={range !== "24h"} lines={lines} />
          )}
        </div>

        <QuickTrade
          symbol={symbol}
          unit={asset?.unit ?? "unités"}
          price={selected?.price}
          account={account}
          onExecuted={onExecuted}
          onToast={onToast}
        />
      </div>
    </section>
  );
}
