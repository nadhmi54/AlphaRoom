import { useMemo } from "react";
import LiveChart from "../market/LiveChart.jsx";

const money = (value) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value ?? 0);
const dateTime = (t) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(t));

/**
 * Évolution de la valeur du portefeuille après chaque exécution, avec le
 * capital de départ en repère : on voit tout de suite si on est au-dessus ou
 * en dessous de la mise initiale (l'échelle ne grossit plus un écart de
 * quelques centimes en grande variation).
 */
export default function EquityPanel({ account }) {
  const initial = account?.portfolio?.initialCash ?? 100000;
  const total = account?.portfolio?.totalValue ?? initial;
  const curve = account?.equityCurve;

  const points = useMemo(() => {
    if (!curve?.length) return [];
    const start = Date.parse(curve[0].date) - 60_000;
    return [
      { t: start, price: initial },
      ...curve.map((point) => ({ t: Date.parse(point.date), price: Number(point.value) })),
      { t: Math.max(Date.now(), Date.parse(curve.at(-1).date) + 1000), price: total },
    ];
  }, [curve, initial, total]);

  const values = points.map((point) => point.price);
  const high = values.length ? Math.max(...values) : initial;
  const low = values.length ? Math.min(...values) : initial;

  return (
    <section className="m1-card ck-equity" aria-label="Évolution du capital">
      <div className="m1-card-heading">
        <div>
          <span className="ck-eyebrow">PERFORMANCE</span>
          <h3>Évolution du capital</h3>
        </div>
        <span className="m1-tag">{curve?.length ?? 0} exécution{(curve?.length ?? 0) > 1 ? "s" : ""}</span>
      </div>
      <dl className="ck-equity-stats">
        <div>
          <dt>Point haut</dt>
          <dd>{money(high)}</dd>
        </div>
        <div>
          <dt>Point bas</dt>
          <dd>{money(low)}</dd>
        </div>
        <div>
          <dt>Aujourd’hui</dt>
          <dd className={total >= initial ? "is-up" : "is-down"}>{money(total)}</dd>
        </div>
      </dl>
      <LiveChart
        points={points}
        lines={[{ price: initial, label: `Capital de départ ${money(initial)}` }]}
        fitLines
        formatTime={dateTime}
        emptyText="Passe un premier ordre : la courbe de ton capital apparaîtra ici."
      />
    </section>
  );
}
