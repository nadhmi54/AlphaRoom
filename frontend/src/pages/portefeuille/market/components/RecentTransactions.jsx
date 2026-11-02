import { formatPrice, formatClock } from "../format-market.js";
import "./RecentTransactions.css";

export default function RecentTransactions({ transactions, loading }) {
  if (loading && transactions.length === 0) return <div className="recent-tx-loading">Chargement...</div>;
  return (
    <ul className="recent-tx-list">
      {transactions.length === 0 && <li className="recent-tx-empty">Aucune transaction</li>}
      {transactions.map((tx) => (
        <li key={tx.id} className="recent-tx-item">
          <div className="tx-main">
            <span className={`tx-side ${tx.side}`}>{tx.side === 'buy' ? 'ACHAT' : 'VENTE'}</span>
            <strong>{tx.symbol}</strong>
          </div>
          <div className="tx-details">
            <span>{tx.quantity} units @ {formatPrice(tx.price)}</span>
            <small>{formatClock(tx.executedAt)}</small>
          </div>
        </li>
      ))}
    </ul>
  );
}
