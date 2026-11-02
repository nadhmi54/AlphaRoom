import ModuleShell from "../../../components/ModuleShell/ModuleShell.jsx";
import useMarketStream from "./hooks/useMarketStream.js";
import useTransactions from "./hooks/useTransactions.js";
import QuotesTable from "./components/QuotesTable.jsx";
import RecentTransactions from "./components/RecentTransactions.jsx";
import TransactionHistory from "./components/TransactionHistory.jsx";
import "./MarketPage.css";

export default function MarketPage() {
  const { quotes, isConnected, error: streamError } = useMarketStream();
  const { 
    transactions, 
    loading, 
    error: txError, 
    filters, 
    setFilter, 
    pagination, 
    setPage,
    exportCsv 
  } = useTransactions();

  return (
    <ModuleShell moduleId="portefeuille">
      <div className="market-page">
        <header className="market-header">
          <h1>Tableau de Bord Marché</h1>
          <div className={`status-badge ${isConnected ? 'is-connected' : 'is-disconnected'}`}>
            {isConnected ? 'Connecté au flux SSE' : 'Déconnecté'}
          </div>
        </header>

        {streamError && <div className="market-alert is-error">{streamError}</div>}
        {txError && <div className="market-alert is-error">{txError}</div>}

        <div className="market-grid">
          <section className="market-section quotes-section">
            <h2>Cotations en Temps Réel</h2>
            <QuotesTable quotes={quotes} />
          </section>

          <section className="market-section recent-tx-section">
            <h2>Dernières Transactions</h2>
            <RecentTransactions transactions={transactions.slice(0, 5)} loading={loading} />
          </section>
        </div>

        <section className="market-section history-section">
          <div className="section-header">
            <h2>Historique Complet</h2>
            <button onClick={exportCsv} className="export-btn">Exporter en CSV</button>
          </div>
          <TransactionHistory 
            transactions={transactions} 
            loading={loading}
            filters={filters}
            onFilterChange={setFilter}
            pagination={pagination}
            onPageChange={setPage}
          />
        </section>
      </div>
    </ModuleShell>
  );
}
