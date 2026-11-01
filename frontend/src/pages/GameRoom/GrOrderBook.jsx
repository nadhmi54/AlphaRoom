
import { assetQtyDecimals, assetUnitShort, formatPrice } from '../../data/roomAssets.js';

export default function GrOrderBook({ book, symbol = 'XAU/USD', currency = '$US', onSelectPrice }) {
  const sym = book?.symbol || symbol;
  const bids = book?.bids || [];
  const asks = book?.asks || [];
  const maxQty = Math.max(
    ...bids.map((b) => b.quantity),
    ...asks.map((a) => a.quantity),
    1,
  );

  return (
    <div className="gr-book-card">
      <div className="gr-book-card__head">
        <span className="gr-eyebrow">CARNET D’ORDRES SIMULÉ</span>
        <h4>Profondeur de marché · {sym}</h4>
      </div>

      <div className="gr-book-table-head">
        <span>Prix ({currency})</span>
        <span className="gr-text-right">Taille ({assetUnitShort(sym)})</span>
      </div>

      {/* Asks (Vendeurs - Rouge) */}
      <ul className="gr-book-list gr-book-list--asks" aria-label="Ordres de vente">
        {asks.slice(0, 5).reverse().map((level, i) => (
          <li key={`ask-${level.price}-${i}`}>
            <button
              type="button"
              className="gr-book-row gr-book-row--ask"
              onClick={() => onSelectPrice?.(level.price, 'buy')}
              title={`Acheter à ${formatPrice(level.price, sym)} ${currency}`}
            >
              <span
                className="gr-book-bar gr-book-bar--ask"
                style={{ width: `${(level.quantity / maxQty) * 100}%` }}
              />
              <span className="gr-book-price">{formatPrice(level.price, sym)}</span>
              <span className="gr-book-qty">{level.quantity.toFixed(assetQtyDecimals(sym))}</span>
            </button>
          </li>
        ))}
      </ul>

      {/* Spread Indicator */}
      <div className="gr-book-spread">
        <span className="gr-book-spread__label">Spread</span>
        <strong className="gr-book-spread__val">
          {book?.spread ? formatPrice(book.spread, sym) : '—'} {currency}
        </strong>
        <span className="gr-book-spread__last">
          Dernier : {book?.lastPrice ? formatPrice(book.lastPrice, sym) : '—'} {currency}
        </span>
      </div>

      {/* Bids (Acheteurs - Vert) */}
      <ul className="gr-book-list gr-book-list--bids" aria-label="Ordres d'achat">
        {bids.slice(0, 5).map((level, i) => (
          <li key={`bid-${level.price}-${i}`}>
            <button
              type="button"
              className="gr-book-row gr-book-row--bid"
              onClick={() => onSelectPrice?.(level.price, 'sell')}
              title={`Vendre à ${formatPrice(level.price, sym)} ${currency}`}
            >
              <span
                className="gr-book-bar gr-book-bar--bid"
                style={{ width: `${(level.quantity / maxQty) * 100}%` }}
              />
              <span className="gr-book-price">{formatPrice(level.price, sym)}</span>
              <span className="gr-book-qty">{level.quantity.toFixed(assetQtyDecimals(sym))}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
