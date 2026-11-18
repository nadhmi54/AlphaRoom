/**
 * Reconstruction de la courbe de valeur d'un portefeuille de Game Room à
 * partir des seules exécutions enregistrées (`sim_trades`) et des prix du
 * scénario. Fonctions pures : ni base, ni réseau, ni horloge implicite.
 *
 * Limites assumées (documentées pour l'ingestion) :
 *   - la valeur suit un simple flux de trésorerie (achat : −qté × prix ;
 *     vente : +qté × prix) : les commissions et l'effet de marge du modèle de la
 *     Game Room ne sont pas rejoués ;
 *   - les positions sont valorisées au dernier prix connu du scénario à chaque
 *     instant échantillonné (échantillon = chaque exécution + la fin de séance) :
 *     une séance courte avec peu d'exécutions donne des indicateurs grossiers ;
 *   - une position courte a une valeur de marché négative (`qté < 0`), cohérent
 *     avec `game-room.service.ts`.
 */

export interface PortfolioTrade {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  /** Seconde de simulation de l'exécution. */
  t: number;
}

export interface PricePoint {
  t: number;
  price: number;
}

export interface ValuePoint {
  t: number;
  value: number;
}

export interface ValueSeriesInput {
  initialCash: number;
  trades: PortfolioTrade[];
  /** Courbe de prix par symbole, chronologique. */
  prices: Record<string, PricePoint[]>;
  /** Fin de séance (seconde) pour clôturer la courbe. */
  endT?: number | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Dernier prix connu à l'instant `t` ; à défaut, le premier de la courbe. */
function priceAt(series: PricePoint[] | undefined, t: number, fallback: number): number {
  if (!series || series.length === 0) return fallback;
  let price = series[0].price;
  for (const point of series) {
    if (point.t > t) break;
    price = point.price;
  }
  return price;
}

/**
 * Courbe de valeur du portefeuille, du capital initial jusqu'à la fin de
 * séance, échantillonnée à chaque exécution. Le premier point est toujours le
 * capital initial (départ de la séance).
 */
export function buildPortfolioValueSeries(input: ValueSeriesInput): ValuePoint[] {
  const initialCash = Number.isFinite(input.initialCash) ? input.initialCash : 0;
  const trades = [...input.trades].sort((a, b) => a.t - b.t);
  const endT = Number.isFinite(input.endT) ? (input.endT as number) : (trades.at(-1)?.t ?? 0);

  const times = new Set<number>([0, endT]);
  for (const trade of trades) times.add(trade.t);
  const ordered = [...times].sort((a, b) => a - b);

  const fallbackPrice = new Map<string, number>();
  for (const trade of trades) fallbackPrice.set(trade.symbol, trade.price);

  const points: ValuePoint[] = [];
  const held = new Map<string, number>();
  let cash = initialCash;
  let cursor = 0;

  for (const t of ordered) {
    while (cursor < trades.length && trades[cursor].t <= t) {
      const trade = trades[cursor];
      cash += trade.side === 'buy' ? -trade.quantity * trade.price : trade.quantity * trade.price;
      const signed = trade.side === 'buy' ? trade.quantity : -trade.quantity;
      held.set(trade.symbol, (held.get(trade.symbol) ?? 0) + signed);
      cursor += 1;
    }

    let positionsValue = 0;
    for (const [symbol, quantity] of held) {
      if (Math.abs(quantity) < 1e-12) continue;
      const fallback = fallbackPrice.get(symbol) ?? 0;
      positionsValue += quantity * priceAt(input.prices[symbol], t, fallback);
    }
    points.push({ t, value: round2(cash + positionsValue) });
  }

  return points;
}

/** Rendement en pourcentage (ex. 5.25 pour +5,25 %), 0 si le capital est nul. */
export function returnPercentFromSeries(values: number[], initialCash: number): number {
  if (!(initialCash > 0) || values.length === 0) return 0;
  const last = values[values.length - 1];
  return round2(((last - initialCash) / initialCash) * 100);
}
