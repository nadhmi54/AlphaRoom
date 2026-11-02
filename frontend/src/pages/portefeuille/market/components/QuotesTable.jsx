import { formatPrice, formatPercent, formatClock, trend } from "../format-market.js";
import "./QuotesTable.css";

export default function QuotesTable({ quotes }) {
  return (
    <div className="quotes-table-wrap">
      <table className="quotes-table">
        <thead>
          <tr>
            <th>Actif</th>
            <th>Bid</th>
            <th>Ask</th>
            <th>Dernier Prix</th>
            <th>Variation %</th>
            <th>Heure</th>
          </tr>
        </thead>
        <tbody>
          {quotes.length === 0 && (
            <tr>
              <td colSpan="6" className="table-empty">Chargement des cotations...</td>
            </tr>
          )}
          {quotes.map((quote) => (
            <tr key={quote.symbol}>
              <td>
                <div className="symbol-cell">
                  <strong>{quote.symbol}</strong>
                  <small>{quote.name}</small>
                </div>
              </td>
              <td className="price-cell">{formatPrice(quote.bid)}</td>
              <td className="price-cell">{formatPrice(quote.ask)}</td>
              <td className="price-cell">
                <span className={`price-value ${trend(quote.changePercent)}`}>
                  {formatPrice(quote.price)}
                </span>
              </td>
              <td>
                <span className={`percent-badge ${trend(quote.changePercent)}`}>
                  {formatPercent(quote.changePercent)}
                </span>
              </td>
              <td>{formatClock(quote.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
