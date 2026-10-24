import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ModuleShell from "../../../components/ModuleShell/ModuleShell.jsx";
import { ApiError } from "../../../services/apiClient.js";
import {
  getTradingAssets,
  getTradingPortfolio,
  placeMarketOrder,
} from "../../../services/tradingService.js";
import "./M1MarchePage.css";

const money = (value) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value ?? 0);
const quantityFormat = (value) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 }).format(value ?? 0);
const dateFormat = (value) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

function EquityChart({ points }) {
  const values = points.map((point) => Number(point.value));
  if (values.length === 0) values.push(100000);
  const width = 720;
  const height = 190;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const path = values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / spread) * (height - 24) - 12;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <div className="m1-chart-wrap">
      <svg
        className="m1-equity-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Évolution de la valeur totale du portefeuille après chaque exécution"
        preserveAspectRatio="none"
      >
        <line x1="0" y1="178" x2={width} y2="178" className="m1-chart-axis" />
        <path d={path} className="m1-chart-line" />
      </svg>
      <div className="m1-chart-caption">
        <span>{points.length ? dateFormat(points[0].date) : "Début du compte"}</span>
        <strong>{money(values.at(-1))}</strong>
        <span>{points.length ? dateFormat(points.at(-1).date) : "Après les opérations"}</span>
      </div>
      <small className="m1-order-note">
        Valeur reconstituée au prix fixe de démonstration de chaque actif.
      </small>
    </div>
  );
}

export default function M1MarchePage() {
  const [assets, setAssets] = useState([]);
  const [account, setAccount] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState("XAU/USD");
  const [side, setSide] = useState("buy");
  const [quantity, setQuantity] = useState("1");
  const [filters, setFilters] = useState({ symbol: "", side: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const quote = assets.find((asset) => asset.symbol === selectedSymbol);
  const assetBySymbol = useMemo(
    () => new Map(assets.map((asset) => [asset.symbol, asset])),
    [assets],
  );

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [nextAssets, nextAccount] = await Promise.all([
        getTradingAssets(),
        getTradingPortfolio({ ...filters, page, limit: 20 }),
      ]);
      setAssets(nextAssets);
      setAccount(nextAccount);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError && requestError.status === 401
          ? "Connectez-vous pour consulter et utiliser votre portefeuille virtuel."
          : requestError.message || "Impossible de charger les données du marché.",
      );
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const units = Number(quantity);
  const estimatedAmount =
    quote && Number.isFinite(units) && units > 0 ? quote.price * units : 0;
  const owned =
    account?.positions.find((position) => position.symbol === selectedSymbol)?.quantity ?? 0;
  const canSubmit =
    account &&
    quote &&
    units > 0 &&
    Number.isFinite(units) &&
    (side === "buy" ? estimatedAmount <= account.portfolio.cash : units <= owned);

  async function submitOrder(event) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      await placeMarketOrder({
        symbol: quote.symbol,
        side,
        quantity: units,
        requestId: crypto.randomUUID(),
      });
      setNotice(
        `${side === "buy" ? "Achat" : "Vente"} simulé(e) : ${quantityFormat(units)} ${quote.unit}.`,
      );
      await refresh();
    } catch (requestError) {
      setError(requestError.message || "L’ordre n’a pas pu être exécuté.");
    } finally {
      setSubmitting(false);
    }
  }

  function updateFilter(key, value) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const stats = account?.stats;
  const pagination = account?.history;

  return (
    <ModuleShell moduleId="m1">
      <section className="m1-trading" aria-busy={loading}>
        <div className="m1-intro">
          <div>
            <p className="m1-eyebrow">SIMULATEUR PÉDAGOGIQUE · USD</p>
            <h2>Votre salle de marché</h2>
            <p>Entraînez-vous avec un portefeuille virtuel. Aucun ordre n’est envoyé sur un marché réel.</p>
          </div>
          <div className="m1-market-status"><span /> Marché simulé</div>
        </div>

        {error && (
          <div className="m1-message m1-message--error" role="alert">
            <span>{error}</span>
            {error.includes("Connectez-vous") && <Link to="/connexion">Se connecter</Link>}
          </div>
        )}
        {notice && <div className="m1-message m1-message--success" role="status">{notice}</div>}

        <div className="m1-summary" aria-label="Résumé du portefeuille">
          <article className="m1-card m1-stat">
            <span>Cash disponible</span>
            <strong>{loading ? "—" : money(account?.portfolio.cash)}</strong>
            <small>Solde en dollars virtuels</small>
          </article>
          <article className="m1-card m1-stat">
            <span>Valeur du portefeuille</span>
            <strong>{loading ? "—" : money(account?.portfolio.totalValue)}</strong>
            <small>Cash + positions au prix simulé</small>
          </article>
          <article className="m1-card m1-stat">
            <span>Performance totale</span>
            <strong className={(account?.portfolio.returnAmount ?? 0) >= 0 ? "is-positive" : "is-negative"}>
              {loading ? "—" : `${money(account?.portfolio.returnAmount)} (${quantityFormat(account?.portfolio.returnPercent)} %)`}
            </strong>
            <small>Depuis le capital initial de {money(account?.portfolio.initialCash)}</small>
          </article>
        </div>

        <div className="m1-summary m1-summary--stats" aria-label="Statistiques de trading">
          <article className="m1-card m1-stat">
            <span>P&L réalisé</span>
            <strong className={(stats?.realizedPnl ?? 0) >= 0 ? "is-positive" : "is-negative"}>
              {loading ? "—" : money(stats?.realizedPnl)}
            </strong>
            <small>Résultat des positions vendues</small>
          </article>
          <article className="m1-card m1-stat">
            <span>Taux de réussite</span>
            <strong>{loading ? "—" : `${quantityFormat(stats?.winRate)} %`}</strong>
            <small>{stats?.profitableTrades ?? 0} gains · {stats?.losingTrades ?? 0} pertes</small>
          </article>
          <article className="m1-card m1-stat">
            <span>Opérations enregistrées</span>
            <strong>{loading ? "—" : stats?.totalOrders ?? 0}</strong>
            <small>{stats?.buyOrders ?? 0} achats · {stats?.sellOrders ?? 0} ventes</small>
          </article>
        </div>

        <div className="m1-workspace">
          <article className="m1-card m1-quote">
            <div className="m1-card-heading">
              <div>
                <span className="m1-eyebrow">ACTIFS SIMULÉS</span>
                <label className="m1-select-label" htmlFor="m1-asset">Choisir un actif</label>
              </div>
              <span className="m1-tag">Cours fixe</span>
            </div>
            <select
              id="m1-asset"
              className="m1-select"
              value={selectedSymbol}
              onChange={(event) => setSelectedSymbol(event.target.value)}
              disabled={!assets.length}
            >
              {assets.map((asset) => (
                <option key={asset.symbol} value={asset.symbol}>{asset.name} · {asset.symbol}</option>
              ))}
            </select>
            <strong className="m1-price">{quote ? money(quote.price) : "—"}</strong>
            <p>{quote ? `${quote.symbol} · ${quote.category} · unité : ${quote.unit}` : "Chargement des actifs…"}</p>
            <small>Aucun flux de marché réel n’est utilisé.</small>
          </article>

          <form className="m1-card m1-order" onSubmit={submitOrder}>
            <div className="m1-card-heading">
              <div><span className="m1-eyebrow">NOUVELLE OPÉRATION</span><h3>Ordre au marché</h3></div>
            </div>
            <div className="m1-side-switch" role="group" aria-label="Sens de l’ordre">
              <button type="button" className={side === "buy" ? "selected buy" : ""} onClick={() => setSide("buy")}>Acheter</button>
              <button type="button" className={side === "sell" ? "selected sell" : ""} onClick={() => setSide("sell")}>Vendre</button>
            </div>
            <label htmlFor="m1-quantity">Quantité <span>({quote?.unit ?? "unités"})</span></label>
            <input
              id="m1-quantity"
              type="number"
              min="0.000001"
              max="1000000"
              step="0.000001"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            <div className="m1-estimate"><span>Montant estimé</span><strong>{money(estimatedAmount)}</strong></div>
            <button className="m1-submit" type="submit" disabled={!canSubmit || submitting || loading}>
              {submitting ? "Exécution…" : `${side === "buy" ? "Acheter" : "Vendre"} ${quantityFormat(units || 0)}`}
            </button>
            <small className="m1-order-note">Exécution immédiate au cours simulé. Aucun frais n’est appliqué.</small>
          </form>
        </div>

        <section className="m1-card m1-chart-card">
          <div className="m1-card-heading">
            <div><span className="m1-eyebrow">PERFORMANCE</span><h3>Évolution de la valeur du portefeuille</h3></div>
            <span className="m1-tag">{account?.equityCurve.length ?? 0} exécutions</span>
          </div>
          <EquityChart points={account?.equityCurve ?? []} />
        </section>

        <section className="m1-card m1-table-card">
          <div className="m1-card-heading">
            <div><span className="m1-eyebrow">PORTEFEUILLE</span><h3>Positions ouvertes</h3></div>
          </div>
          {!account?.positions.some((position) => position.quantity > 0) ? (
            <p className="m1-empty">Aucune position ouverte. Choisissez un actif et passez un achat simulé pour commencer.</p>
          ) : (
            <div className="m1-table-wrap">
              <table>
                <thead><tr><th>Actif</th><th>Quantité</th><th>Prix moyen</th><th>Valeur</th><th>P&L latent</th></tr></thead>
                <tbody>
                  {account.positions.filter((position) => position.quantity > 0).map((position) => (
                    <tr key={position.symbol}>
                      <td>{assetBySymbol.get(position.symbol)?.name ?? position.symbol} · {position.symbol}</td>
                      <td>{quantityFormat(position.quantity)} {assetBySymbol.get(position.symbol)?.unit}</td>
                      <td>{money(position.averagePrice)}</td>
                      <td>{money(position.marketValue)}</td>
                      <td className={position.unrealizedPnl >= 0 ? "is-positive" : "is-negative"}>{money(position.unrealizedPnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="m1-card m1-table-card">
          <div className="m1-card-heading">
            <div><span className="m1-eyebrow">HISTORIQUE</span><h3>Exécutions ({pagination?.total ?? 0})</h3></div>
            <button className="m1-refresh" type="button" onClick={refresh} disabled={loading}>Actualiser</button>
          </div>
          <div className="m1-filters" aria-label="Filtres de l’historique">
            <label>Actif
              <select value={filters.symbol} onChange={(event) => updateFilter("symbol", event.target.value)}>
                <option value="">Tous les actifs</option>
                {assets.map((asset) => <option key={asset.symbol} value={asset.symbol}>{asset.symbol}</option>)}
              </select>
            </label>
            <label>Opération
              <select value={filters.side} onChange={(event) => updateFilter("side", event.target.value)}>
                <option value="">Achats et ventes</option><option value="buy">Achats</option><option value="sell">Ventes</option>
              </select>
            </label>
            <label>Du
              <input type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} />
            </label>
            <label>Au
              <input type="date" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} />
            </label>
            <button className="m1-refresh" type="button" onClick={() => { setPage(1); setFilters({ symbol: "", side: "", from: "", to: "" }); }}>Effacer les filtres</button>
          </div>
          {!account?.executions.length ? (
            <p className="m1-empty">Aucune opération ne correspond à ces filtres.</p>
          ) : (
            <div className="m1-table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Actif</th><th>Opération</th><th>Quantité</th><th>Prix</th><th>Montant</th><th>P&L réalisé</th></tr></thead>
                <tbody>
                  {account.executions.map((execution) => (
                    <tr key={execution.id}>
                      <td>{dateFormat(execution.executedAt)}</td>
                      <td>{execution.symbol}</td>
                      <td className={execution.side === "buy" ? "is-positive" : "is-negative"}>{execution.side === "buy" ? "Achat" : "Vente"}</td>
                      <td>{quantityFormat(execution.quantity)} {assetBySymbol.get(execution.symbol)?.unit}</td>
                      <td>{money(execution.price)}</td>
                      <td>{money(execution.amount)}</td>
                      <td className={(execution.realizedPnl ?? 0) >= 0 ? "is-positive" : "is-negative"}>{execution.side === "sell" ? money(execution.realizedPnl) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pagination?.pages > 1 && (
            <div className="m1-pagination">
              <span>Page {pagination.page} sur {pagination.pages}</span>
              <div>
                <button type="button" className="m1-refresh" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Précédent</button>
                <button type="button" className="m1-refresh" disabled={page >= pagination.pages || loading} onClick={() => setPage((current) => current + 1)}>Suivant</button>
              </div>
            </div>
          )}
        </section>
      </section>
    </ModuleShell>
  );
}
