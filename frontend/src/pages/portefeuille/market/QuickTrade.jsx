import { useEffect, useMemo, useRef, useState } from "react";
import { placeBookOrder } from "../../../services/orderBookService.js";
import useShortcuts from "../cockpit/useShortcuts.js";
import { formatPrice } from "./format.js";

const usd = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const qtyFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 });
const PRESETS = [0.25, 0.5, 0.75, 1];
// Marge pour qu'un ordre « tout mon cash » ne dépasse pas le cash disponible
// quand il traverse plusieurs niveaux du carnet.
const BUY_SAFETY = 0.99;

const floorQuantity = (value) => Math.floor(Math.max(value, 0) * 1e6) / 1e6;

/**
 * Ordre rapide au marché, juste à côté du graphique : choix du sens, de la
 * quantité (en un clic : 25 %, 50 %, 75 % ou tout), estimation et envoi. Les
 * ordres limite restent dans le carnet d'ordres, plus bas.
 */
export default function QuickTrade({ symbol, unit, price, account, onExecuted, onToast }) {
  const [side, setSide] = useState("buy");
  const [quantity, setQuantity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const input = useRef(null);

  // Une quantité saisie pour un actif n'a pas de sens pour un autre.
  useEffect(() => {
    setQuantity("");
    setError("");
  }, [symbol]);

  const cash = account?.portfolio?.cash ?? 0;
  const held = useMemo(
    () => account?.positions?.find((position) => position.symbol === symbol)?.quantity ?? 0,
    [account, symbol],
  );
  const max = side === "buy" ? floorQuantity((cash / (price || Infinity)) * BUY_SAFETY) : floorQuantity(held);
  const units = Number(quantity);
  const valid = Number.isFinite(units) && units > 0;
  const tooMuch = valid && units > max + 1e-9;
  const estimate = valid ? units * (price ?? 0) : 0;
  const canSubmit = valid && !tooMuch && Boolean(price) && !submitting && Boolean(account);

  const shortcuts = useMemo(
    () => ({
      b: (event) => {
        event.preventDefault();
        setSide("buy");
        input.current?.focus();
      },
      s: (event) => {
        event.preventDefault();
        setSide("sell");
        input.current?.focus();
      },
    }),
    [],
  );
  useShortcuts(shortcuts);

  async function submit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await placeBookOrder({
        symbol,
        side,
        type: "market",
        quantity: units,
        requestId: crypto.randomUUID(),
      });
      const filled = result.filledQuantity ?? 0;
      if (filled > 0) {
        onToast?.({
          tone: "success",
          title: `${side === "buy" ? "Acheté" : "Vendu"} ${qtyFormat.format(filled)} ${unit} · ${symbol}`,
          text: `Prix moyen ${usd.format(result.averagePrice)} — total ${usd.format(result.notional)}.`,
        });
      } else {
        const message = "Aucun ordre en face dans le carnet : rien n'a été exécuté.";
        setError(message);
        onToast?.({ tone: "error", title: "Ordre non exécuté", text: message });
      }
      setQuantity("");
      onExecuted?.();
    } catch (requestError) {
      const message = requestError.message || "L’ordre n’a pas pu être exécuté.";
      setError(message);
      onToast?.({ tone: "error", title: "Ordre refusé", text: message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={`qt qt--${side}`} onSubmit={submit} aria-label="Ordre rapide au marché">
      <div className="qt-head">
        <span className="ck-eyebrow">ORDRE RAPIDE · AU MARCHÉ</span>
      </div>

      <div className="qt-sides" role="group" aria-label="Sens de l'ordre">
        <button type="button" className={side === "buy" ? "is-active is-buy" : ""} aria-pressed={side === "buy"} onClick={() => setSide("buy")}>
          Acheter <kbd aria-hidden="true">B</kbd>
        </button>
        <button type="button" className={side === "sell" ? "is-active is-sell" : ""} aria-pressed={side === "sell"} onClick={() => setSide("sell")}>
          Vendre <kbd aria-hidden="true">S</kbd>
        </button>
      </div>

      <label className="qt-field" htmlFor="qt-quantity">
        Quantité <span>({unit})</span>
        <input
          id="qt-quantity"
          ref={input}
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="0"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </label>

      <div className="qt-presets" role="group" aria-label="Quantité en pourcentage">
        {PRESETS.map((share) => (
          <button
            key={share}
            type="button"
            disabled={max <= 0}
            onClick={() => setQuantity(String(share === 1 ? max : floorQuantity(max * share)))}
          >
            {share === 1 ? "Max" : `${share * 100} %`}
          </button>
        ))}
      </div>

      <dl className="qt-lines">
        <div>
          <dt>Prix du marché</dt>
          <dd>{price ? `${formatPrice(price)} $` : "—"}</dd>
        </div>
        <div>
          <dt>{side === "buy" ? "Cash disponible" : "Position détenue"}</dt>
          <dd>{side === "buy" ? usd.format(cash) : `${qtyFormat.format(held)} ${unit}`}</dd>
        </div>
        <div className="qt-total">
          <dt>Montant estimé</dt>
          <dd>{usd.format(estimate)}</dd>
        </div>
      </dl>

      {tooMuch && (
        <p className="qt-warn" role="alert">
          {side === "buy" ? "Dépasse ton cash disponible" : "Dépasse la quantité que tu détiens"} (max {qtyFormat.format(max)}).
        </p>
      )}
      {error && !tooMuch && (
        <p className="qt-warn" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="qt-submit" disabled={!canSubmit}>
        {submitting ? "Envoi…" : `${side === "buy" ? "Acheter" : "Vendre"} ${symbol}`}
      </button>
      <p className="qt-hint">Exécution immédiate contre le carnet. Pour fixer ton prix, utilise l’ordre limite plus bas.</p>
    </form>
  );
}
