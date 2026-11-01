import { round } from '../contract/equity.js';
import type { TradeData } from '../contract/session-data.js';

const EPSILON = 1e-9;

/**
 * Un cycle va de l'ouverture d'une position (quantité 0 → >0) à sa fermeture
 * (retour à 0). Racheter après avoir soldé ouvre un nouveau cycle : les
 * résultats ne se mélangent pas. Méthode du prix moyen pondéré, comme le
 * module M2 « Positions & répartition ».
 */
export interface PositionCycle {
  symbol: string;
  openMinute: number;
  closeMinute: number | null;
  status: 'open' | 'closed';
  /** Quantité encore détenue (0 si fermée). */
  quantity: number;
  averageCost: number;
  /** P&L encaissé sur le cycle (ventes). */
  realizedPnl: number;
  /** Identifiants des exécutions du cycle, dans l'ordre. */
  tradeIds: string[];
  /** Identifiant de l'exécution qui a ouvert le cycle. */
  openingTradeId: string;
}

export interface CycleResult {
  cycles: PositionCycle[];
  /** Ventes supérieures à la quantité détenue (vente à découvert non gérée). */
  anomalies: string[];
}

export function buildCycles(trades: TradeData[]): CycleResult {
  const sorted = [...trades].sort((a, b) => a.minute - b.minute);
  const current = new Map<string, PositionCycle>();
  const cycles: PositionCycle[] = [];
  const anomalies: string[] = [];

  for (const trade of sorted) {
    let cycle = current.get(trade.symbol);
    if (trade.side === 'buy') {
      if (!cycle) {
        cycle = {
          symbol: trade.symbol,
          openMinute: trade.minute,
          closeMinute: null,
          status: 'open',
          quantity: 0,
          averageCost: 0,
          realizedPnl: 0,
          tradeIds: [],
          openingTradeId: trade.id,
        };
        current.set(trade.symbol, cycle);
        cycles.push(cycle);
      }
      const total = cycle.quantity + trade.quantity;
      cycle.averageCost = (cycle.averageCost * cycle.quantity + trade.price * trade.quantity) / total;
      cycle.quantity = total;
      cycle.tradeIds.push(trade.id);
      continue;
    }

    if (!cycle) {
      anomalies.push(trade.id);
      continue;
    }
    const sold = Math.min(cycle.quantity, trade.quantity);
    if (trade.quantity - sold > EPSILON) anomalies.push(trade.id);
    cycle.realizedPnl += (trade.price - cycle.averageCost) * sold;
    cycle.quantity -= sold;
    cycle.tradeIds.push(trade.id);
    if (cycle.quantity < EPSILON) {
      cycle.quantity = 0;
      cycle.status = 'closed';
      cycle.closeMinute = trade.minute;
      current.delete(trade.symbol);
    }
  }

  for (const cycle of cycles) {
    cycle.realizedPnl = round(cycle.realizedPnl, 2);
    cycle.averageCost = round(cycle.averageCost, 4);
  }
  return { cycles, anomalies };
}
