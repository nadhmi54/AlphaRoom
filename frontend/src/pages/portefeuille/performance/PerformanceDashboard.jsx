import PerformanceHistoryChart from "./PerformanceHistoryChart.jsx";
import usePerformance from "./usePerformance.js";
import "./PerformanceDashboard.css";

const money = (value) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value ?? 0);

const decimal = (value, digits = 2) =>
  new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value ?? 0);

const percent = (value) => `${decimal(Math.abs(value ?? 0) * 100)} %`;

/** La VaR et le drawdown sont des pertes : on les affiche signées négatives. */
const loss = (value) => (value === null || value === undefined ? null : `−${percent(value)}`);

const dayLabel = (value) =>
  value
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(`${value}T00:00:00`))
    : "";

/**
 * Indicateurs de performance et de risque du portefeuille (module M3).
 *
 * Les quatre chiffres viennent de `GET /api/portfolios/:id/performance`, calculé
 * à la volée à partir de l'historique des snapshots quotidiens. Un indicateur
 * qui demande plus de recul que l'historique disponible reste affiché « — » :
 * on montre qu'il manque des données plutôt que d'inventer un chiffre.
 */
export default function PerformanceDashboard({ portfolioId, initialCash }) {
  const { metrics, history, loading, error, reload } = usePerformance(portfolioId);

  if (!portfolioId) {
    return (
      <section className="m1-card pf-panel">
        <p className="pf-state">
          Votre portefeuille n’est pas encore créé : passez un premier ordre pour activer le suivi
          des performances.
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="m1-card pf-panel">
        <div className="m1-message m1-message--error" role="alert">
          <span>{error}</span>
          <button type="button" className="m1-refresh" onClick={reload} disabled={loading}>
            {loading ? "Chargement…" : "Réessayer"}
          </button>
        </div>
      </section>
    );
  }

  const cards = [
    {
      key: "volatilityAnnualized",
      label: "Volatilité annualisée",
      value:
        metrics?.volatilityAnnualized === null || metrics?.volatilityAnnualized === undefined
          ? null
          : `${percent(metrics.volatilityAnnualized)}`,
      hint: "Écart-type des rendements journaliers ramené à l’année (× √252).",
      tone: "",
    },
    {
      key: "maxDrawdown",
      label: "Max drawdown",
      value: loss(metrics?.maxDrawdown),
      hint: "Pire baisse depuis un plus haut de la valeur du portefeuille.",
      tone: "is-down",
    },
    {
      key: "var95",
      label: "VaR 95 %",
      value: loss(metrics?.var95),
      hint: "Perte journalière au quantile 5 % des rendements passés (méthode historique).",
      tone: "is-down",
    },
    {
      key: "sharpeRatio",
      label: "Ratio de Sharpe",
      value:
        metrics?.sharpeRatio === null || metrics?.sharpeRatio === undefined
          ? null
          : decimal(metrics.sharpeRatio),
      hint: "Rendement excédentaire rapporté à la volatilité, annualisé.",
      tone:
        metrics?.sharpeRatio > 0 ? "is-up" : metrics?.sharpeRatio < 0 ? "is-down" : "",
    },
  ];

  const missing = cards.filter((card) => card.value === null);

  return (
    <div className="pf" aria-busy={loading}>
      <section className="m1-card pf-panel" aria-label="Indicateurs de performance">
        <div className="m1-card-heading">
          <div>
            <span className="ck-eyebrow">RISQUE</span>
            <h3>
              Indicateurs de performance
              {metrics && metrics.observations > 0 && (
                <span>{metrics.observations} jour{metrics.observations > 1 ? "s" : ""} de données</span>
              )}
            </h3>
          </div>
          <button type="button" className="m1-refresh" onClick={reload} disabled={loading}>
            {loading ? "Actualisation…" : "Actualiser"}
          </button>
        </div>

        {loading && !metrics && <p className="pf-state">Calcul des indicateurs…</p>}

        {metrics && (
          <>
            <p className="pf-summary">
              <span>
                Valeur au {dayLabel(metrics.asOf)} : <strong>{money(metrics.totalValue)}</strong>
              </span>
              {metrics.dailyReturn !== null && (
                <em className={metrics.dailyReturn >= 0 ? "is-up" : "is-down"}>
                  {metrics.dailyReturn >= 0 ? "+" : "−"}
                  {percent(metrics.dailyReturn)} sur la journée
                </em>
              )}
            </p>

            <ul className="pf-kpis">
              {cards.map((card) => (
                <li key={card.key} className="pf-kpi" data-available={card.value !== null}>
                  <span className="pf-kpi-label">{card.label}</span>
                  <strong className={`pf-kpi-value ${card.tone}`}>{card.value ?? "—"}</strong>
                  <span className="pf-kpi-hint">
                    {card.value === null
                      ? "Pas encore assez d’historique pour ce calcul."
                      : card.hint}
                  </span>
                </li>
              ))}
            </ul>

            {missing.length > 0 && (
              <p className="pf-notice">
                {missing.length} indicateur{missing.length > 1 ? "s" : ""} encore indisponible
                {missing.length > 1 ? "s" : ""} : la volatilité, le drawdown, la VaR et le Sharpe
                se calculent sur les snapshots quotidiens, enregistrés automatiquement une fois par
                jour. Il en faut au moins deux pour que la courbe et les ratios apparaissent.
              </p>
            )}
          </>
        )}
      </section>

      <PerformanceHistoryChart history={history} referenceValue={initialCash} />
    </div>
  );
}
