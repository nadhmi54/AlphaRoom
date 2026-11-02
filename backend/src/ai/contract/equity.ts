import type { EquityPoint, PricePoint, TradeData } from './session-data.js';

/**
 * Dernier prix connu d'un actif à une minute donnée. Retombe sur `fallback`
 * si aucun prix n'est encore disponible (début de séance).
 */
export function priceAt(
  prices: PricePoint[],
  symbol: string,
  minute: number,
  fallback?: number,
): number | undefined {
  let best: PricePoint | undefined;
  for (const point of prices) {
    if (point.symbol !== symbol || point.minute > minute) continue;
    if (!best || point.minute >= best.minute) best = point;
  }
  return best ? best.price : fallback;
}

/**
 * Reconstruit la courbe de valeur d'un portefeuille minute par minute à partir
 * de ses exécutions. Utile à l'adaptateur de la simulation quand elle ne
 * fournit pas encore de snapshots ; les données fictives s'en servent aussi.
 */
export function buildEquityCurve(
  initialCash: number,
  trades: TradeData[],
  prices: PricePoint[],
  durationMinutes: number,
): EquityPoint[] {
  const sorted = [...trades].sort((a, b) => a.minute - b.minute);
  const curve: EquityPoint[] = [];
  for (let minute = 0; minute <= durationMinutes; minute += 1) {
    let cash = initialCash;
    const quantity = new Map<string, number>();
    const lastPrice = new Map<string, number>();
    for (const trade of sorted) {
      if (trade.minute > minute) break;
      const signed = trade.side === 'buy' ? trade.quantity : -trade.quantity;
      cash -= signed * trade.price;
      quantity.set(trade.symbol, (quantity.get(trade.symbol) ?? 0) + signed);
      lastPrice.set(trade.symbol, trade.price);
    }
    let positionsValue = 0;
    for (const [symbol, held] of quantity) {
      if (Math.abs(held) < 1e-9) continue;
      const price = priceAt(prices, symbol, minute, lastPrice.get(symbol)) ?? 0;
      positionsValue += held * price;
    }
    curve.push({ minute, cash: round(cash, 2), positionsValue: round(positionsValue, 2) });
  }
  return curve;
}

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
