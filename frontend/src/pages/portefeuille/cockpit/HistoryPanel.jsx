const money = (value) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value ?? 0);
const quantityFormat = (value) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 }).format(value ?? 0);
const dateFormat = (value) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const EMPTY_FILTERS = { symbol: "", side: "", from: "", to: "" };

/** Historique des exécutions : filtres, tableau, pagination. */
export default function HistoryPanel({
  account,
  assets,
  filters,
  onFilter,
  onClear,
  page,
  onPage,
  loading,
  onRefresh,
}) {
  const pagination = account?.history;
  const assetBySymbol = new Map(assets.map((asset) => [asset.symbol, asset]));
  const filtered = Object.keys(EMPTY_FILTERS).some((key) => filters[key]);

  return (
    <section className="m1-card ck-history" aria-label="Historique des exécutions">
      <div className="m1-card-heading">
        <div>
          <span className="ck-eyebrow">HISTORIQUE</span>
          <h3>Exécutions ({pagination?.total ?? 0})</h3>
        </div>
        <button className="m1-refresh" type="button" onClick={onRefresh} disabled={loading}>
          Actualiser
        </button>
      </div>

      <div className="m1-filters" aria-label="Filtres de l’historique">
        <label>
          Actif
          <select value={filters.symbol} onChange={(event) => onFilter("symbol", event.target.value)}>
            <option value="">Tous les actifs</option>
            {assets.map((asset) => (
              <option key={asset.symbol} value={asset.symbol}>
                {asset.symbol}
              </option>
            ))}
          </select>
        </label>
        <label>
          Opération
          <select value={filters.side} onChange={(event) => onFilter("side", event.target.value)}>
            <option value="">Achats et ventes</option>
            <option value="buy">Achats</option>
            <option value="sell">Ventes</option>
          </select>
        </label>
        <label>
          Du
          <input type="date" value={filters.from} onChange={(event) => onFilter("from", event.target.value)} />
        </label>
        <label>
          Au
          <input type="date" value={filters.to} onChange={(event) => onFilter("to", event.target.value)} />
        </label>
        {filtered && (
          <button className="m1-refresh" type="button" onClick={onClear}>
            Effacer les filtres
          </button>
        )}
      </div>

      {!account?.executions.length ? (
        <p className="m1-empty">
          {filtered
            ? "Aucune opération ne correspond à ces filtres."
            : "Aucune opération pour l’instant. Tes achats et ventes apparaîtront ici."}
        </p>
      ) : (
        <div className="m1-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Actif</th>
                <th>Opération</th>
                <th>Quantité</th>
                <th>Prix</th>
                <th>Montant</th>
                <th>P&L réalisé</th>
              </tr>
            </thead>
            <tbody>
              {account.executions.map((execution) => (
                <tr key={execution.id}>
                  <td>{dateFormat(execution.executedAt)}</td>
                  <td>{execution.symbol}</td>
                  <td>
                    <span className={`ck-side ${execution.side === "buy" ? "is-buy" : "is-sell"}`}>
                      {execution.side === "buy" ? "Achat" : "Vente"}
                    </span>
                  </td>
                  <td>
                    {quantityFormat(execution.quantity)} {assetBySymbol.get(execution.symbol)?.unit}
                  </td>
                  <td>{money(execution.price)}</td>
                  <td>{money(execution.amount)}</td>
                  <td className={(execution.realizedPnl ?? 0) >= 0 ? "is-positive" : "is-negative"}>
                    {execution.side === "sell" ? money(execution.realizedPnl) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination?.pages > 1 && (
        <div className="m1-pagination">
          <span>
            Page {pagination.page} sur {pagination.pages}
          </span>
          <div>
            <button type="button" className="m1-refresh" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>
              Précédent
            </button>
            <button type="button" className="m1-refresh" disabled={page >= pagination.pages || loading} onClick={() => onPage(page + 1)}>
              Suivant
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
