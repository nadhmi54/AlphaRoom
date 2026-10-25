import { useEffect, useRef, useState } from "react";
import useAnimatedNumber from "./useAnimatedNumber.js";

const usd = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const money = (value) => usd.format(value ?? 0);
const signedMoney = (value) => `${(value ?? 0) > 0 ? "+" : ""}${money(value)}`;
const percent = (value) => {
  const rounded = Math.round((value ?? 0) * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded)} %`;
};
const clock = (value) =>
  value
    ? value.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";

/** Le grand chiffre : partie entière en gros, centimes et devise en petit. */
function BigNumber({ value }) {
  const parts = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(value ?? 0);
  const decimalIndex = parts.findIndex((part) => part.type === "decimal");
  const whole = parts.slice(0, decimalIndex).map((part) => part.value).join("");
  const cents = parts.slice(decimalIndex).map((part) => part.value).join("");
  return (
    <strong className="ck-hero-value" data-testid="hero-value">
      {whole}
      <small>
        {cents} $US
      </small>
    </strong>
  );
}

function PulseLine({ samples }) {
  if (samples.length < 2) {
    return <p className="ck-pulse-wait">Le pouls se dessine à chaque mise à jour (toutes les 5 s)…</p>;
  }
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  // Échelle honnête : un écart de quelques centimes sur un capital de 100 000 $
  // doit rester une ligne presque plate, pas une chute spectaculaire.
  const spread = Math.max(max - min, Math.abs(max) * 0.0005);
  const up = samples.at(-1) >= samples[0];
  const points = samples.map((value, index) => {
    const x = (index / (samples.length - 1)) * 200;
    const y = 30 - ((value - (min + max) / 2) / spread) * 46;
    return [x, y];
  });
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = points.at(-1);
  return (
    <div className={`ck-pulse ${up ? "is-up" : "is-down"}`}>
      <svg viewBox="0 0 200 60" preserveAspectRatio="none" role="img" aria-label="Pouls du portefeuille">
        <defs>
          <linearGradient id="ck-pulse-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L200 60 L0 60 Z`} fill="url(#ck-pulse-fill)" />
        <path d={line} className="ck-pulse-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="ck-pulse-dot"
        style={{ left: `${(lastX / 200) * 100}%`, top: `${(lastY / 60) * 100}%` }}
      />
    </div>
  );
}

function ActionsMenu({ onReset, disabled }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (root.current && !root.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="ck-menu" ref={root}>
      <button
        type="button"
        className="ck-icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Actions du portefeuille"
        onClick={() => setOpen((value) => !value)}
      >
        ⋯
      </button>
      {open && (
        <div className="ck-menu-list" role="menu">
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onReset();
            }}
          >
            Réinitialiser le portefeuille
            <small>Cash à 100 000 $ · positions et historique effacés</small>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * En-tête de la page : la valeur du portefeuille en grand, la performance, le
 * partage cash / investi et le « pouls » de la session.
 */
export default function PortfolioHero({ account, loading, lastSync, pulse, onReset, resetting }) {
  const portfolio = account?.portfolio;
  const stats = account?.stats;
  const total = useAnimatedNumber(portfolio?.totalValue);
  const cash = portfolio?.cash ?? 0;
  const invested = Math.max((portfolio?.totalValue ?? 0) - cash, 0);
  const cashShare = portfolio?.totalValue ? Math.min((cash / portfolio.totalValue) * 100, 100) : 100;
  const gain = portfolio?.returnAmount ?? 0;

  return (
    <section className="ck-hero" aria-busy={loading} aria-label="Résumé du portefeuille">
      <div className="ck-hero-main">
        <div className="ck-hero-top">
          <span className="ck-eyebrow">VALEUR TOTALE DU PORTEFEUILLE</span>
          <div className="ck-hero-tools">
            <span className={`ck-live${account ? "" : " is-offline"}`} title="Actualisation automatique toutes les 5 secondes">
              <i aria-hidden="true" />
              {account ? "En direct" : "Hors ligne"}
              {account && lastSync && <em>{clock(lastSync)}</em>}
            </span>
            <ActionsMenu onReset={onReset} disabled={!account || resetting} />
          </div>
        </div>

        {loading && !portfolio ? (
          <strong className="ck-hero-value ck-hero-value--wait">—</strong>
        ) : (
          <BigNumber value={total} />
        )}

        <div className="ck-hero-return">
          <span className={`ck-pill ${gain > 0 ? "is-up" : gain < 0 ? "is-down" : ""}`}>
            {gain > 0 ? "▲" : gain < 0 ? "▼" : "•"} {signedMoney(gain)} · {percent(portfolio?.returnPercent)}
          </span>
          <span className="ck-hero-since">depuis le capital de {money(portfolio?.initialCash)}</span>
        </div>

        <div className="ck-split" aria-label="Répartition cash et investi">
          <div className="ck-split-bar" role="img" aria-label={`${cashShare.toFixed(0)} % en cash`}>
            <span style={{ width: `${cashShare}%` }} />
          </div>
          <div className="ck-split-legend">
            <span>
              <i className="is-cash" /> Cash <strong>{money(cash)}</strong>
            </span>
            <span>
              <i className="is-invested" /> Investi <strong>{money(invested)}</strong>
            </span>
          </div>
        </div>
      </div>

      <div className="ck-hero-side">
        <div className="ck-hero-stats">
          <div>
            <span>P&L réalisé</span>
            <strong className={stats?.realizedPnl > 0 ? "is-up" : stats?.realizedPnl < 0 ? "is-down" : ""}>
              {signedMoney(stats?.realizedPnl)}
            </strong>
          </div>
          <div>
            <span>Opérations</span>
            <strong>{stats?.totalOrders ?? 0}</strong>
            <small>
              {stats?.buyOrders ?? 0} achats · {stats?.sellOrders ?? 0} ventes
            </small>
          </div>
        </div>
        <div className="ck-hero-pulse">
          <span className="ck-eyebrow">POULS DE LA SESSION</span>
          <PulseLine samples={pulse} />
        </div>
      </div>
    </section>
  );
}
