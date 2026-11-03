import { useEffect, useMemo, useRef, useState } from "react";
import LiveChart from "./LiveChart.jsx";
import QuickTrade from "./QuickTrade.jsx";
import { formatPercent, formatPrice, trend } from "./format.js";
import { RANGES } from "./useLiveMarket.js";
import useSymbolSearch from "./useSymbolSearch.js";
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
 * Barre de recherche d'actifs avec suggestions Binance.
 * Appelle onSelect(binanceSymbol) quand l'utilisateur choisit un résultat.
 */
function SymbolSearchBar({ onSelect }) {
  const { query, results, searching, search, reset } = useSymbolSearch();
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Fermer la liste au clic en dehors
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (e) => {
    const value = e.target.value;
    search(value);
    setOpen(Boolean(value.trim()));
  };

  const handleSelect = (binanceSymbol) => {
    // On garde le symbole d'affichage canonique (BNB/USDT) : il est identique
    // côté backend et évite de fragmenter le carnet/les positions entre
    // « BNBUSDT » et « BNB/USDT ».
    onSelect(binanceSymbol);
    reset();
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      reset();
      setOpen(false);
    }
  };

  return (
    <div className="lm-search" ref={containerRef}>
      <div className="lm-search__input-wrap">
        <svg className="lm-search__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="lm-search__input"
          placeholder="Rechercher un actif… (ETH, SOL, BNB…)"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query.trim() && setOpen(true)}
          aria-label="Rechercher un actif"
          aria-autocomplete="list"
          aria-expanded={open && results.length > 0}
          autoComplete="off"
          spellCheck={false}
        />
        {searching && <span className="lm-search__spinner" aria-hidden="true" />}
        {query && !searching && (
          <button
            type="button"
            className="lm-search__clear"
            aria-label="Effacer la recherche"
            onClick={() => { reset(); setOpen(false); }}
          >
            ×
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="lm-search__dropdown" role="listbox" aria-label="Résultats de recherche">
          {results.map((item) => (
            <li key={item.binanceSymbol} role="option">
              <button
                type="button"
                className="lm-search__result"
                onClick={() => handleSelect(item.displaySymbol ?? item.binanceSymbol)}
              >
                <span className="lm-search__result-symbol">{item.displaySymbol}</span>
                <span className="lm-search__result-name">{item.name}</span>
                <span className="lm-search__result-price">{formatPrice(item.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !searching && query.trim() && results.length === 0 && (
        <div className="lm-search__empty">Aucun actif trouvé pour « {query} »</div>
      )}
    </div>
  );
}

/**
 * Scène « marché » : cartes des actifs (prix + mini-courbe qui bougent chaque
 * seconde), barre de recherche Binance, grand graphique de l'actif choisi avec
 * ta ligne d'achat moyen, et l'ordre rapide.
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
  // `symbol` est la clé brute (ex. "BNBUSDT" ou "XAU/USD").
  // Pour un actif custom, `selected.displaySymbol` donne le label lisible ("BNB/USDT").
  const selected = quotes.find((quote) => quote.symbol === symbol);
  const asset = assets.find((item) => item.symbol === symbol);
  const flash = usePriceFlash(selected?.price);

  const first = series[0]?.price;
  const rangeChange = first && selected ? ((selected.price - first) / first) * 100 : 0;

  // Libellé affiché dans le titre : displaySymbol si dispo (custom), sinon symbol.
  const displayLabel = selected?.displaySymbol ?? symbol;

  // Ta position sur cet actif : ligne « prix d'achat moyen » sur la courbe.
  const position = account?.positions?.find((item) => item.symbol === symbol && item.quantity > 0);
  const lines = useMemo(() => {
    if (!position || !selected) return [];
    const pnl = (selected.price - position.averagePrice) * position.quantity;
    return [{ price: position.averagePrice, label: `Ton achat moyen ${formatPrice(position.averagePrice)} · ${signed(pnl)}` }];
  }, [position, selected]);

  return (
    <section className={`lm-panel${focus ? " is-focus" : ""}`} aria-label="Marché en direct">

      {/* Barre de recherche — les 4 cartes fixes sont supprimées */}
      <SymbolSearchBar onSelect={onSymbolChange} />

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
                <h4>{selected?.name ?? displayLabel}</h4>
                <span className="lm-symbol">{displayLabel}</span>
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

          {loadingSeries && series.length === 0 ? (
            <div className="lm-chart lm-chart--empty">Chargement de la courbe…</div>
          ) : series.length < 2 && !loadingSeries ? (
            <div className="lm-chart lm-chart--empty">Données insuffisantes pour afficher la courbe.</div>
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
