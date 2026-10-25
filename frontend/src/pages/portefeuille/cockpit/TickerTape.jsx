import { formatPercent, formatPrice, trend } from "../market/format.js";

/**
 * Bandeau de prix qui défile en continu, comme sur un écran de salle de
 * marché. Le contenu est doublé pour que la boucle soit sans coupure ; le
 * défilement s'arrête au survol et pour qui préfère les animations réduites.
 */
export default function TickerTape({ quotes, onSelect }) {
  if (!quotes.length) return <div className="ck-ticker ck-ticker--empty" aria-hidden="true" />;

  const renderItems = (hidden) =>
    quotes.map((quote) => (
      <button
        key={`${hidden ? "b" : "a"}-${quote.symbol}`}
        type="button"
        className="ck-ticker-item"
        tabIndex={hidden ? -1 : 0}
        aria-hidden={hidden || undefined}
        onClick={() => onSelect(quote.symbol)}
      >
        <i className={quote.source === "live" ? "is-live" : "is-sim"} aria-hidden="true" />
        <strong>{quote.symbol}</strong>
        <span>{formatPrice(quote.price)}</span>
        <em className={trend(quote.changePercent)}>
          {quote.changePercent > 0 ? "▲" : quote.changePercent < 0 ? "▼" : "•"}{" "}
          {formatPercent(quote.changePercent)}
        </em>
      </button>
    ));

  return (
    <div className="ck-ticker" role="region" aria-label="Prix en direct">
      <div className="ck-ticker-track">
        <div className="ck-ticker-set">{renderItems(false)}</div>
        <div className="ck-ticker-set" aria-hidden="true">
          {renderItems(true)}
        </div>
      </div>
    </div>
  );
}
