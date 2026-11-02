import { formatPrice, formatClock } from "../format-market.js";
import "./TransactionHistory.css";

export default function TransactionHistory({ transactions, loading, filters, onFilterChange, pagination, onPageChange }) {
  const assets = ['XAU/USD', 'EUR/USD', 'BTC/USD', 'AAPL'];
  return (
    <div className="tx-history">
      <div className="filters-bar">
        <select value={filters.symbol} onChange={(e) => onFilterChange('symbol', e.target.value)}>
          <option value="">Tous les actifs</option>
          {assets.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filters.side} onChange={(e) => onFilterChange('side', e.target.value)}>
          <option value="">Tous les sens</option>
          <option value="buy">Achat</option>
          <option value="sell">Vente</option>
        </select>
        <input type="date" value={filters.from} onChange={(e) => onFilterChange('from', e.target.value)} />
        <input type="date" value={filters.to} onChange={(e) => onFilterChange('to', e.target.value)} />
      </div>
      <div className="history-table-wrap">
        <table className="history-table">
          <thead><tr><th>Date</th><th>Actif</th><th>Sens</th><th>Quantité</th><th>Prix</th><th>Montant</th><th>Statut</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan="7" className="table-loading">Chargement...</td></tr>}
            {!loading && transactions.length === 0 && <tr><td colSpan="7" className="table-empty">Aucun résultat</td></tr>}
            {!loading && transactions.map(tx => (
              <tr key={tx.id}>
                <td>{formatClock(tx.executedAt)}</td>
                <td><strong>{tx.symbol}</strong></td>
                <td><span className={`side-badge ${tx.side}`}>{tx.side === 'buy' ? 'Achat' : 'Vente'}</span></td>
                <td>{tx.quantity}</td>
                <td>{formatPrice(tx.price)}</td>
                <td><strong>{formatPrice(tx.amount)}</strong></td>
                <td><span className="status-badge executed">{tx.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination-bar">
        <span>Page {pagination.page} sur {pagination.totalPages}</span>
        <div className="pagination-btns">
          <button disabled={pagination.page <= 1 || loading} onClick={() => onPageChange(pagination.page - 1)}>Précédent</button>
          <button disabled={pagination.page >= pagination.totalPages || loading} onClick={() => onPageChange(pagination.page + 1)}>Suivant</button>
        </div>
      </div>
    </div>
  );
}
