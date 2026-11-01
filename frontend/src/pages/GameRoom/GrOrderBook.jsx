import React from 'react';

export default function GrOrderBook({ book, onSelectPrice }) {
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
        <h4>Profondeur de marché · XAU/USD</h4>
      </div>

      <div className="gr-book-table-head">
        <span>Prix ($US)</span>
        <span className="gr-text-right">Taille (oz)</span>
      </div>

      {/* Asks (Vendeurs - Rouge) */}
      <ul className="gr-book-list gr-book-list--asks" aria-label="Ordres de vente">
        {asks.slice(0, 5).reverse().map((level, i) => (
          <li key={`ask-${level.price}-${i}`}>
            <button
              type="button"
              className="gr-book-row gr-book-row--ask"
              onClick={() => onSelectPrice?.(level.price, 'buy')}
              title={`Acheter à ${level.price.toFixed(2)} $US`}
            >
              <span
                className="gr-book-bar gr-book-bar--ask"
                style={{ width: `${(level.quantity / maxQty) * 100}%` }}
              />
              <span className="gr-book-price">{level.price.toFixed(2)}</span>
              <span className="gr-book-qty">{level.quantity.toFixed(2)}</span>
            </button>
          </li>
        ))}
      </ul>

      {/* Spread Indicator */}
      <div className="gr-book-spread">
        <span className="gr-book-spread__label">Spread</span>
        <strong className="gr-book-spread__val">
          {book?.spread ? book.spread.toFixed(2) : '0.25'} $US
        </strong>
        <span className="gr-book-spread__last">
          Dernier : {book?.lastPrice ? book.lastPrice.toFixed(2) : '2 700.00'} $
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
              title={`Vendre à ${level.price.toFixed(2)} $US`}
            >
              <span
                className="gr-book-bar gr-book-bar--bid"
                style={{ width: `${(level.quantity / maxQty) * 100}%` }}
              />
              <span className="gr-book-price">{level.price.toFixed(2)}</span>
              <span className="gr-book-qty">{level.quantity.toFixed(2)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
