import { useState } from "react";
import usePositions from "./usePositions.js";
import "./PositionsPanel.css";

const money = (value) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value ?? 0);
const signedMoney = (value) => `${(value ?? 0) > 0 ? "+" : ""}${money(value)}`;
const number = (value, digits = 6) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(value ?? 0);
const percent = (value, digits = 1) => `${number(value, digits)} %`;
const signedPercent = (value) => `${(value ?? 0) > 0 ? "+" : ""}${percent(value, 2)}`;
const date = (value) =>
  value
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value))
    : "—";
const tone = (value) => (value > 0 ? "is-positive" : value < 0 ? "is-negative" : "");

const SLICE_COLORS = ["#d9b877", "#3fd1b5", "#6ea8fe", "#a78bfa", "#ff9b73", "#f472b6", "#9bd45a"];
const CASH_COLOR = "#5f6a80";

function sliceColor(slice, assetIndex) {
  return slice.kind === "cash" ? CASH_COLOR : SLICE_COLORS[assetIndex % SLICE_COLORS.length];
}

function Donut({ slices, totalValue }) {
  let offset = 0;
  let assetIndex = -1;
  const arcs = slices.map((slice) => {
    if (slice.kind === "asset") assetIndex += 1;
    const arc = {
      key: slice.key,
      color: sliceColor(slice, assetIndex),
      dash: `${Math.max(slice.weightPercent, 0)} ${100 - Math.max(slice.weightPercent, 0)}`,
      offset: -offset,
    };
    offset += Math.max(slice.weightPercent, 0);
    return arc;
  });

  return (
    <div className="pp-donut">
      <svg viewBox="0 0 42 42" role="img" aria-label="Répartition du portefeuille">
        <circle cx="21" cy="21" r="15.9155" className="pp-donut-track" />
        {arcs.map((arc) => (
          <circle
            key={arc.key}
            cx="21"
            cy="21"
            r="15.9155"
            fill="none"
            stroke={arc.color}
            strokeWidth="5"
            strokeDasharray={arc.dash}
            strokeDashoffset={arc.offset}
            transform="rotate(-90 21 21)"
          />
        ))}
      </svg>
      <div className="pp-donut-center">
        <span>Total</span>
        <strong>{money(totalValue)}</strong>
      </div>
    </div>
  );
}

function AllocationView({ allocation }) {
  if (!allocation || allocation.slices.length === 0) {
    return <p className="pp-empty">Aucune donnée de répartition pour le moment.</p>;
  }
  let assetIndex = -1;
  return (
    <div className="pp-allocation">
      <Donut slices={allocation.slices} totalValue={allocation.totalValue} />
      <ul className="pp-legend">
        {allocation.slices.map((slice) => {
          if (slice.kind === "asset") assetIndex += 1;
          return (
            <li key={slice.key} className={slice.concentrated ? "is-alert" : ""}>
              <span className="pp-dot" style={{ background: sliceColor(slice, assetIndex) }} />
              <span className="pp-legend-name">
                {slice.kind === "cash" ? "Cash" : slice.key}
                {slice.concentrated && <em>Concentré</em>}
              </span>
              <span className="pp-legend-value">{money(slice.value)}</span>
              <strong>{percent(slice.weightPercent)}</strong>
            </li>
          );
        })}
        <li className="pp-legend-note">
          Seuil d’alerte : {percent(allocation.thresholdPercent, 0)} de la valeur totale sur un seul actif.
        </li>
      </ul>
    </div>
  );
}

function OpenTable({ rows, assetBySymbol }) {
  if (rows.length === 0) {
    return (
      <p className="pp-empty">
        Aucune position ouverte. Passez un achat dans le carnet d’ordres pour commencer.
      </p>
    );
  }
  return (
    <div className="pp-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Actif</th>
            <th>Quantité</th>
            <th>Prix moyen</th>
            <th>Prix actuel</th>
            <th>Valeur</th>
            <th>P&L latent</th>
            <th>Poids</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const asset = assetBySymbol.get(row.symbol);
            return (
              <tr key={row.symbol}>
                <td data-label="Actif">
                  <strong>{row.symbol}</strong>
                  {asset?.name && <small>{asset.name}</small>}
                </td>
                <td data-label="Quantité">
                  {number(row.quantity)} {asset?.unit}
                </td>
                <td data-label="Prix moyen">{money(row.averagePrice)}</td>
                <td data-label="Prix actuel">
                  {row.priceAvailable ? money(row.currentPrice) : "—"}
                </td>
                <td data-label="Valeur">{money(row.marketValue)}</td>
                <td data-label="P&L latent" className={tone(row.unrealizedPnl)}>
                  {signedMoney(row.unrealizedPnl)}
                  <small>{signedPercent(row.unrealizedPercent)}</small>
                </td>
                <td data-label="Poids">
                  <div className="pp-weight">
                    <span style={{ width: `${Math.min(row.weightPercent, 100)}%` }} />
                  </div>
                  <small>{percent(row.weightPercent)}</small>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClosedTable({ rows }) {
  if (rows.length === 0) {
    return (
      <p className="pp-empty">
        Aucune position fermée. Une position se ferme quand vous avez revendu toute la quantité.
      </p>
    );
  }
  return (
    <div className="pp-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Actif</th>
            <th>Ouverte</th>
            <th>Fermée</th>
            <th>Achat moyen</th>
            <th>Vente moyenne</th>
            <th>P&L réalisé</th>
            <th>Rendement</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.symbol}-${row.openedAt}`}>
              <td data-label="Actif">
                <strong>{row.symbol}</strong>
              </td>
              <td data-label="Ouverte">{date(row.openedAt)}</td>
              <td data-label="Fermée">{date(row.closedAt)}</td>
              <td data-label="Achat moyen">{money(row.averageBuyPrice)}</td>
              <td data-label="Vente moyenne">
                {row.averageSellPrice === null ? "—" : money(row.averageSellPrice)}
              </td>
              <td data-label="P&L réalisé" className={tone(row.realizedPnl)}>
                {signedMoney(row.realizedPnl)}
              </td>
              <td data-label="Rendement" className={tone(row.returnPercent)}>
                {row.returnPercent === null ? "—" : signedPercent(row.returnPercent)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = [
  { id: "open", label: "Ouvertes" },
  { id: "closed", label: "Fermées" },
  { id: "allocation", label: "Répartition" },
];

/**
 * Module M2 — Positions & répartition.
 * `refreshKey` : valeur qui change quand le portefeuille est resynchronisé.
 * `assets` : liste des actifs du marché (noms et unités), optionnelle.
 */
export default function PositionsPanel({ refreshKey, assets = [] }) {
  const { positions, allocation, loading, error } = usePositions(refreshKey);
  const [tab, setTab] = useState("open");
  const assetBySymbol = new Map(assets.map((asset) => [asset.symbol, asset]));

  const summary = positions?.summary;
  const open = positions?.open ?? [];
  const closed = positions?.closed ?? [];
  const warning = allocation?.status === "warning";
  const counts = { open: summary?.openCount ?? 0, closed: summary?.closedCount ?? 0 };

  return (
    <section className="m1-card pp-panel" aria-busy={loading} aria-label="Positions et répartition">
      <div className="m1-card-heading">
        <div>
          <span className="m1-eyebrow">POSITIONS & RÉPARTITION</span>
          <h3>Ce que vous détenez</h3>
        </div>
        {summary && (
          <span className="m1-tag">
            {summary.winningCycles} gagnante{summary.winningCycles > 1 ? "s" : ""} ·{" "}
            {summary.losingCycles} perdante{summary.losingCycles > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {error && (
        <div className="pp-error" role="alert">
          {error}
        </div>
      )}

      {summary && (
        <dl className="pp-chips">
          <div>
            <dt>Valeur investie</dt>
            <dd>{money(summary.marketValue)}</dd>
          </div>
          <div>
            <dt>P&L latent</dt>
            <dd className={tone(summary.unrealizedPnl)}>{signedMoney(summary.unrealizedPnl)}</dd>
          </div>
          <div>
            <dt>P&L réalisé</dt>
            <dd className={tone(summary.realizedPnl)}>{signedMoney(summary.realizedPnl)}</dd>
          </div>
        </dl>
      )}

      {allocation && allocation.status !== "empty" && (
        <div
          className={`pp-banner ${warning ? "is-warning" : "is-ok"}`}
          role={warning ? "alert" : "status"}
        >
          <span className="pp-banner-icon" aria-hidden="true">
            {warning ? "!" : "✓"}
          </span>
          <span>{allocation.message}</span>
        </div>
      )}

      <div className="pp-tabs" role="tablist" aria-label="Vue des positions">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`pp-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls="pp-tabpanel"
            className={tab === item.id ? "is-active" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.id !== "allocation" && <span>{counts[item.id]}</span>}
          </button>
        ))}
      </div>

      <div id="pp-tabpanel" role="tabpanel" aria-labelledby={`pp-tab-${tab}`}>
        {loading && !positions ? (
          <p className="pp-empty">Chargement…</p>
        ) : tab === "open" ? (
          <OpenTable rows={open} assetBySymbol={assetBySymbol} />
        ) : tab === "closed" ? (
          <ClosedTable rows={closed} />
        ) : (
          <AllocationView allocation={allocation} />
        )}
      </div>
    </section>
  );
}
