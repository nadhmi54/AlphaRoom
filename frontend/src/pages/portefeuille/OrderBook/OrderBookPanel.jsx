import { useEffect, useMemo, useState } from "react";
import {
  cancelBookOrder,
  placeBookOrder,
} from "../../../services/orderBookService.js";
import { BOOK_REFRESH_MS, useOrderBook } from "./useOrderBook.js";
import "./OrderBookPanel.css";

const money = (value) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value ?? 0);
const priceFormat = (value) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }).format(value);
const quantityFormat = (value) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 }).format(value ?? 0);
const clockFormat = (value) =>
  value
    ? new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(value))
    : "—";

const STATUS_LABELS = {
  open: "En attente",
  partially_filled: "Partiel",
  filled: "Exécuté",
  cancelled: "Annulé",
};

const PENDING = new Set(["open", "partially_filled"]);

/** Résumé lisible d'une exécution, ex. « 8 à 2 001,00 $ + 7 à 2 002,00 $ ». */
function describeResult(result, unit) {
  const { order, fills } = result;
  if (!fills?.length) {
    return `Ordre limite enregistré : ${quantityFormat(order.quantity)} ${unit} en attente à ${money(order.limitPrice)}.`;
  }
  const detail = fills
    .map((fill) => `${quantityFormat(fill.quantity)} à ${money(fill.price)}`)
    .join(" + ");
  const resting =
    order.remainingQuantity > 0
      ? ` Reste ${quantityFormat(order.remainingQuantity)} ${unit} en attente à ${money(order.limitPrice)}.`
      : "";
  return `Exécuté : ${detail} — prix moyen ${money(order.averagePrice)}.${resting}`;
}

/**
 * Carnet d'ordres de M1 : sélection de l'actif, bids en vert, asks en rouge,
 * spread au milieu, mise à jour en direct, passage d'ordres au marché ou
 * limite et annulation des ordres en attente.
 */
export default function OrderBookPanel({ symbol, assets = [], onSymbolChange, onExecuted }) {
  const asset = assets.find((item) => item.symbol === symbol);
  const unit = asset?.unit ?? "unités";
  const { book, orders, error, loading, lastSync, refresh } = useOrderBook(symbol);
  const [side, setSide] = useState("buy");
  const [type, setType] = useState("limit");
  const [quantity, setQuantity] = useState("1");
  const [limitPrice, setLimitPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  // Le prix limite saisi pour un actif n'a pas de sens pour un autre :
  // on efface le champ au changement d'actif.
  useEffect(() => {
    setLimitPrice("");
  }, [symbol]);

  const pendingOrders = useMemo(
    () => orders.filter((order) => PENDING.has(order.status)),
    [orders],
  );

  const maxQuantity = useMemo(() => {
    const all = [...(book?.bids ?? []), ...(book?.asks ?? [])];
    return Math.max(...all.map((level) => level.quantity), 0);
  }, [book]);

  const units = Number(quantity);
  const limit = Number(limitPrice);
  const referencePrice = type === "limit" && limit > 0 ? limit : (book?.lastPrice ?? 0);
  const estimate =
    Number.isFinite(units) && units > 0 ? units * referencePrice : 0;
  const canSubmit =
    Boolean(book) &&
    Number.isFinite(units) &&
    units > 0 &&
    (type === "market" || (Number.isFinite(limit) && limit > 0)) &&
    !submitting;

  function pickLevel(levelSide, levelPrice) {
    // Cliquer un ask = acheter à ce prix, cliquer un bid = vendre.
    setSide(levelSide === "sell" ? "buy" : "sell");
    setType("limit");
    setLimitPrice(String(levelPrice));
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setActionError("");
    setNotice("");
    try {
      const result = await placeBookOrder({
        symbol,
        side,
        type,
        quantity: units,
        limitPrice: type === "limit" ? limit : undefined,
        requestId: crypto.randomUUID(),
      });
      setNotice(describeResult(result, unit));
      await refresh();
      onExecuted?.();
    } catch (requestError) {
      setActionError(requestError.message || "L’ordre n’a pas pu être exécuté.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelOrder(orderId) {
    setCancelling(orderId);
    setActionError("");
    setNotice("");
    try {
      await cancelBookOrder(orderId);
      setNotice("Ordre annulé : le cash et la quantité réservés sont libérés.");
      await refresh();
      onExecuted?.();
    } catch (requestError) {
      setActionError(requestError.message || "L’annulation a échoué.");
    } finally {
      setCancelling(null);
    }
  }

  const levels = (sideKey) => (sideKey === "sell" ? book?.asks ?? [] : book?.bids ?? []);

  const renderLevels = (sideKey) => {
    const rows = sideKey === "sell" ? [...levels(sideKey)].reverse() : levels(sideKey);
    if (!rows.length) {
      return <li className="ob-empty">Aucun ordre de ce côté.</li>;
    }
    return rows.map((level) => (
      <li key={`${sideKey}-${level.price}`}>
        <button
          type="button"
          className={`ob-level ob-level--${sideKey}`}
          onClick={() => pickLevel(sideKey, level.price)}
          title={`${sideKey === "sell" ? "Acheter" : "Vendre"} à ${priceFormat(level.price)} (${level.orders} ordre${level.orders > 1 ? "s" : ""})`}
        >
          <span
            className="ob-bar"
            aria-hidden="true"
            style={{ width: `${maxQuantity ? (level.quantity / maxQuantity) * 100 : 0}%` }}
          />
          <span className="ob-price">{priceFormat(level.price)}</span>
          <span className="ob-qty">{quantityFormat(level.quantity)}</span>
        </button>
      </li>
    ));
  };

  return (
    <section className="ob-card" aria-busy={loading}>
      <header className="ob-header">
        <div>
          <span className="ob-eyebrow">CARNET D’ORDRES</span>
          <h3>{book?.name ?? symbol} · {symbol}</h3>
        </div>
        <span className={`ob-live${book ? "" : " is-offline"}`} title={`Rafraîchissement toutes les ${BOOK_REFRESH_MS / 1000} secondes`}>
          <span className="ob-dot" aria-hidden="true" />
          {book ? "En direct" : "Hors ligne"}
          {book && <em>{clockFormat(lastSync)}</em>}
        </span>
      </header>

      {error && <p className="ob-message ob-message--error" role="alert">{error}</p>}

      {!book && !error && <p className="ob-message">Chargement du carnet…</p>}

      {book && (
        <>
          <div className="ob-body">
            <div className="ob-book">
              <div className="ob-book-head">
                <span>Vendeurs (asks)</span>
                <span>Quantité</span>
              </div>
              <ul className="ob-levels">{renderLevels("sell")}</ul>

              <div className="ob-spread">
                <span>Spread</span>
                <strong>
                  {book.spread === null ? "—" : priceFormat(book.spread)}
                  {book.spread !== null && book.bestAsk ? (
                    <small>{((book.spread / book.bestAsk) * 100).toFixed(3)} %</small>
                  ) : null}
                </strong>
                <span className="ob-last">Dernier {priceFormat(book.lastPrice)}</span>
              </div>

              <div className="ob-book-head">
                <span>Acheteurs (bids)</span>
                <span>Quantité</span>
              </div>
              <ul className="ob-levels">{renderLevels("buy")}</ul>
            </div>

            <form className="ob-form" onSubmit={submitOrder}>
              <label className="ob-field" htmlFor="ob-asset">
                Actif
                <select
                  id="ob-asset"
                  value={symbol}
                  disabled={!assets.length}
                  onChange={(event) => onSymbolChange?.(event.target.value)}
                >
                  {assets.map((item) => (
                    <option key={item.symbol} value={item.symbol}>
                      {item.name} · {item.symbol}
                    </option>
                  ))}
                </select>
              </label>
              <p className="ob-asset-info">
                Dernier prix exécuté{asset ? ` · ${asset.category} · unité : ${unit}` : ""}
              </p>

              <div className="ob-toggle" role="group" aria-label="Type d’ordre">
                <button type="button" className={type === "limit" ? "selected" : ""} onClick={() => setType("limit")}>Limite</button>
                <button type="button" className={type === "market" ? "selected" : ""} onClick={() => setType("market")}>Marché</button>
              </div>
              <div className="ob-toggle ob-toggle--side" role="group" aria-label="Sens de l’ordre">
                <button type="button" className={`ob-buy${side === "buy" ? " selected" : ""}`} onClick={() => setSide("buy")}>Acheter</button>
                <button type="button" className={`ob-sell${side === "sell" ? " selected" : ""}`} onClick={() => setSide("sell")}>Vendre</button>
              </div>

              <label className="ob-field" htmlFor="ob-quantity">
                Quantité <span>({unit})</span>
                <input
                  id="ob-quantity"
                  type="number"
                  min="0.000001"
                  max="1000000"
                  step="0.000001"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </label>

              {type === "limit" && (
                <label className="ob-field" htmlFor="ob-price">
                  Prix limite <span>(USD)</span>
                  <input
                    id="ob-price"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={limitPrice}
                    placeholder={priceFormat(book.lastPrice)}
                    onChange={(event) => setLimitPrice(event.target.value)}
                  />
                </label>
              )}

              <div className="ob-estimate">
                <span>Montant estimé</span>
                <strong>{money(estimate)}</strong>
              </div>

              <button className={`ob-submit${side === "sell" ? " is-sell" : ""}`} type="submit" disabled={!canSubmit}>
                {submitting
                  ? "Envoi…"
                  : `${side === "buy" ? "Acheter" : "Vendre"}${type === "market" ? " au marché" : " en limite"}`}
              </button>
              <p className="ob-hint">
                {type === "market"
                  ? "Consomme le carnet du meilleur prix au plus mauvais ; le reliquat est annulé."
                  : "S’exécute si le prix croise le carnet, sinon reste en attente."}
              </p>
            </form>
          </div>

          {notice && <p className="ob-message ob-message--success" role="status">{notice}</p>}
          {actionError && <p className="ob-message ob-message--error" role="alert">{actionError}</p>}

          <div className="ob-orders">
            <div className="ob-book-head">
              <span>Mes ordres en attente ({pendingOrders.length})</span>
              <span>Carnet</span>
            </div>
            {!pendingOrders.length ? (
              <p className="ob-empty">Aucun ordre en attente.</p>
            ) : (
              <ul className="ob-order-list">
                {pendingOrders.map((order) => (
                  <li key={order.id}>
                    <div className="ob-order-main">
                      <strong className={order.side === "buy" ? "ob-buy-text" : "ob-sell-text"}>
                        {order.side === "buy" ? "Achat" : "Vente"} {quantityFormat(order.remainingQuantity)}
                      </strong>
                      <span>
                        {order.symbol} · {order.type === "limit" ? priceFormat(order.limitPrice) : "marché"} ·{" "}
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="ob-cancel"
                      onClick={() => cancelOrder(order.id)}
                      disabled={cancelling === order.id}
                    >
                      {cancelling === order.id ? "…" : "Annuler"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
