import { useMemo } from "react";
import LiveChart from "../market/LiveChart.jsx";

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

const percent = (value) => `${decimal((value ?? 0) * 100)} %`;

const dayLabel = (timestamp) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "2-digit" }).format(
    new Date(timestamp),
  );

/**
 * Évolution de la valeur du portefeuille dans le temps, à partir des snapshots
 * quotidiens. Le graphique est celui du cockpit (`LiveChart`) : la courbe est la
 * même que celle du capital, mais tracée sur les points journaliers du job de
 * snapshot et non sur les exécutions.
 *
 * La volatilité n'a pas sa propre courbe (l'axe du graphique est en dollars) :
 * elle est reprise juste en dessous, sous forme de trois repères.
 */
export default function PerformanceHistoryChart({ history, referenceValue }) {
  const items = history?.items ?? [];

  // L'API pagine du plus récent au plus ancien : le graphique se lit dans
  // l'autre sens.
  const points = useMemo(
    () =>
      [...items]
        .reverse()
        .map((item) => ({ t: Date.parse(item.date), price: item.totalValue })),
    [items],
  );

  const volatility = useMemo(() => {
    const values = items
      .map((item) => item.volatilityAnnualized)
      .filter((value) => value !== null);
    if (values.length === 0) return null;
    return {
      last: values[0],
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
      max: Math.max(...values),
    };
  }, [items]);

  const lines = referenceValue
    ? [{ price: referenceValue, label: `Capital de départ ${money(referenceValue)}` }]
    : [];

  const emptyText =
    items.length === 0
      ? "Aucun snapshot enregistré : l’historique se remplit une fois par jour."
      : "Un seul jour enregistré : la courbe apparaîtra au deuxième snapshot quotidien.";

  return (
    <section className="m1-card pf-chart" aria-label="Historique des performances">
      <div className="m1-card-heading">
        <div>
          <span className="ck-eyebrow">HISTORIQUE QUOTIDIEN</span>
          <h3>Évolution de la valeur</h3>
        </div>
        <span className="m1-tag">
          {history?.total ?? 0} jour{(history?.total ?? 0) > 1 ? "s" : ""}
        </span>
      </div>

      <LiveChart points={points} lines={lines} fitLines formatTime={dayLabel} emptyText={emptyText} />

      {volatility && (
        <dl className="ck-equity-stats pf-volatility">
          <div>
            <dt>Volatilité (dernier jour)</dt>
            <dd>{percent(volatility.last)}</dd>
          </div>
          <div>
            <dt>Volatilité moyenne</dt>
            <dd>{percent(volatility.average)}</dd>
          </div>
          <div>
            <dt>Volatilité maximale</dt>
            <dd>{percent(volatility.max)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
