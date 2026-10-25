/**
 * Calculs purs du module M2 « Positions & répartition ».
 *
 * Aucune dépendance Nest/TypeORM : ces fonctions ne font que du calcul, donc
 * elles se testent simplement et peuvent être réutilisées telles quelles par
 * le module de risque (M6) — par exemple pour refuser un ordre qui ferait
 * dépasser le seuil de concentration.
 *
 * Les formules reprennent celles du module trading afin que les deux
 * pages affichent exactement les mêmes chiffres : le coût d'un achat est le
 * montant arrondi à 0,01 de l'exécution, et le P&L d'une vente est arrondi
 * à 0,01.
 */

/** En dessous de cette quantité, une position est considérée comme soldée. */
export const QTY_EPSILON = 0.0000005;

/** Un actif investi pesant plus que ce pourcentage déclenche l'alerte. */
export const CONCENTRATION_THRESHOLD_PERCENT = 30;

export type OrderSide = 'buy' | 'sell';

/** Une exécution de l'historique (`trade_executions`), valeurs déjà numériques. */
export interface ExecutionRecord {
  id: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  /** Montant de l'exécution, arrondi à 0,01 (quantité × prix). */
  amount: number;
  executedAt: Date;
}

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export const roundMoney = (value: number) => round(value, 2);

/* ------------------------------------------------------------------ */
/* Cycles de position (ouverte → … → fermée)                           */
/* ------------------------------------------------------------------ */

/**
 * Un cycle commence quand la quantité passe de 0 à plus de 0 et se termine
 * quand elle revient à 0. Racheter un actif après l'avoir soldé ouvre un
 * nouveau cycle : les résultats ne se mélangent pas.
 */
export interface PositionCycle {
  symbol: string;
  status: 'open' | 'closed';
  openedAt: Date;
  closedAt: Date | null;
  /** Quantité encore détenue (0 si fermée). */
  quantity: number;
  /** Prix moyen de la quantité encore détenue (0 si fermée). */
  averagePrice: number;
  totalBought: number;
  totalSold: number;
  /** Somme des montants d'achat. */
  totalCost: number;
  /** Somme des montants de vente. */
  totalProceeds: number;
  /** Prix d'achat moyen sur tout le cycle. */
  averageBuyPrice: number;
  /** Prix de vente moyen sur tout le cycle (null tant que rien n'est vendu). */
  averageSellPrice: number | null;
  /** P&L encaissé sur ce cycle (somme des ventes). */
  realizedPnl: number;
  /** P&L réalisé ÷ coût des quantités vendues, en % (null si rien vendu). */
  returnPercent: number | null;
  executionCount: number;
}

interface WorkingCycle {
  symbol: string;
  openedAt: Date;
  closedAt: Date | null;
  quantity: number;
  averagePrice: number;
  totalBought: number;
  totalSold: number;
  totalCost: number;
  totalProceeds: number;
  soldCost: number;
  realizedPnl: number;
  executionCount: number;
}

function compareExecutions(a: ExecutionRecord, b: ExecutionRecord) {
  const byTime = a.executedAt.getTime() - b.executedAt.getTime();
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function finalize(cycle: WorkingCycle): PositionCycle {
  const closed = cycle.closedAt !== null;
  return {
    symbol: cycle.symbol,
    status: closed ? 'closed' : 'open',
    openedAt: cycle.openedAt,
    closedAt: cycle.closedAt,
    quantity: closed ? 0 : round(cycle.quantity, 6),
    averagePrice: closed ? 0 : round(cycle.averagePrice, 4),
    totalBought: round(cycle.totalBought, 6),
    totalSold: round(cycle.totalSold, 6),
    totalCost: roundMoney(cycle.totalCost),
    totalProceeds: roundMoney(cycle.totalProceeds),
    averageBuyPrice: cycle.totalBought
      ? round(cycle.totalCost / cycle.totalBought, 4)
      : 0,
    averageSellPrice: cycle.totalSold
      ? round(cycle.totalProceeds / cycle.totalSold, 4)
      : null,
    realizedPnl: roundMoney(cycle.realizedPnl),
    returnPercent: cycle.soldCost > 0
      ? round((cycle.realizedPnl / cycle.soldCost) * 100, 2)
      : null,
    executionCount: cycle.executionCount,
  };
}

/**
 * Rejoue l'historique et reconstruit tous les cycles de position.
 * Les ventes qui dépasseraient la quantité détenue sont plafonnées, et une
 * vente sans position ouverte est ignorée (données incohérentes).
 *
 * Résultat : les cycles fermés, du plus récent au plus ancien, puis les
 * cycles ouverts triés par symbole.
 */
export function buildPositionCycles(executions: ExecutionRecord[]): PositionCycle[] {
  const sorted = [...executions].sort(compareExecutions);
  const current = new Map<string, WorkingCycle>();
  const finished: WorkingCycle[] = [];

  for (const execution of sorted) {
    let cycle = current.get(execution.symbol);

    if (execution.side === 'buy') {
      if (!cycle) {
        cycle = {
          symbol: execution.symbol,
          openedAt: execution.executedAt,
          closedAt: null,
          quantity: 0,
          averagePrice: 0,
          totalBought: 0,
          totalSold: 0,
          totalCost: 0,
          totalProceeds: 0,
          soldCost: 0,
          realizedPnl: 0,
          executionCount: 0,
        };
        current.set(execution.symbol, cycle);
      }
      const nextQuantity = cycle.quantity + execution.quantity;
      cycle.averagePrice =
        (cycle.quantity * cycle.averagePrice + execution.amount) / nextQuantity;
      cycle.quantity = nextQuantity;
      cycle.totalBought += execution.quantity;
      cycle.totalCost += execution.amount;
      cycle.executionCount += 1;
      continue;
    }

    if (!cycle) continue;
    const soldQuantity = Math.min(execution.quantity, cycle.quantity);
    if (soldQuantity <= 0) continue;
    // La vente ne modifie pas le prix moyen, seulement la quantité.
    const pnl = roundMoney(soldQuantity * (execution.price - cycle.averagePrice));
    cycle.realizedPnl = roundMoney(cycle.realizedPnl + pnl);
    cycle.soldCost += soldQuantity * cycle.averagePrice;
    cycle.totalSold += soldQuantity;
    cycle.totalProceeds += execution.amount;
    cycle.quantity -= soldQuantity;
    cycle.executionCount += 1;

    if (cycle.quantity < QTY_EPSILON) {
      cycle.quantity = 0;
      cycle.closedAt = execution.executedAt;
      finished.push(cycle);
      current.delete(execution.symbol);
    }
  }

  const closed = finished
    .map(finalize)
    .sort((a, b) => b.closedAt!.getTime() - a.closedAt!.getTime());
  const open = [...current.values()]
    .map(finalize)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  return [...closed, ...open];
}

/* ------------------------------------------------------------------ */
/* Valorisation d'une position ouverte                                  */
/* ------------------------------------------------------------------ */

export interface HoldingValuation {
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  /** Quantité × prix actuel. */
  marketValue: number;
  /** Quantité × prix moyen (ce que la position a coûté). */
  costBasis: number;
  /** P&L latent : (prix actuel − prix moyen) × quantité. */
  unrealizedPnl: number;
  unrealizedPercent: number;
}

export function valuePosition(
  quantity: number,
  averagePrice: number,
  currentPrice: number,
): HoldingValuation {
  const marketValue = roundMoney(quantity * currentPrice);
  const costBasis = roundMoney(quantity * averagePrice);
  const unrealizedPnl = roundMoney(marketValue - costBasis);
  return {
    quantity,
    averagePrice,
    currentPrice,
    marketValue,
    costBasis,
    unrealizedPnl,
    unrealizedPercent: costBasis > 0 ? round((unrealizedPnl / costBasis) * 100, 2) : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Répartition (allocation)                                             */
/* ------------------------------------------------------------------ */

export const CASH_KEY = 'CASH';

export interface Holding {
  symbol: string;
  quantity: number;
  price: number;
}

export interface AllocationSlice {
  /** « CASH » ou le symbole de l'actif. */
  key: string;
  kind: 'cash' | 'asset';
  value: number;
  /** Poids en % de la valeur totale (cash inclus). */
  weightPercent: number;
  /** Vrai si un actif investi dépasse le seuil de concentration. */
  concentrated: boolean;
}

export type DiversificationStatus = 'empty' | 'ok' | 'warning';

export interface AllocationResult {
  totalValue: number;
  cashValue: number;
  investedValue: number;
  thresholdPercent: number;
  slices: AllocationSlice[];
  concentratedSymbols: string[];
  largestAssetWeightPercent: number;
  status: DiversificationStatus;
  message: string;
}

/**
 * Calcule la répartition du portefeuille : le cash et chaque actif détenu,
 * avec leur poids sur la valeur totale. Le cash compte dans le total mais ne
 * déclenche jamais l'alerte de concentration.
 */
export function computeAllocation(
  cash: number,
  holdings: Holding[],
  thresholdPercent: number = CONCENTRATION_THRESHOLD_PERCENT,
): AllocationResult {
  const assets = holdings
    .map((holding) => ({
      symbol: holding.symbol,
      value: roundMoney(holding.quantity * holding.price),
    }))
    .filter((asset) => asset.value > 0)
    .sort((a, b) => b.value - a.value || a.symbol.localeCompare(b.symbol));

  const cashValue = roundMoney(Math.max(0, cash));
  const investedValue = roundMoney(assets.reduce((sum, asset) => sum + asset.value, 0));
  const totalValue = roundMoney(cashValue + investedValue);
  const weightOf = (value: number) =>
    totalValue > 0 ? round((value / totalValue) * 100, 2) : 0;

  const assetSlices: AllocationSlice[] = assets.map((asset) => {
    const weightPercent = weightOf(asset.value);
    return {
      key: asset.symbol,
      kind: 'asset',
      value: asset.value,
      weightPercent,
      concentrated: weightPercent > thresholdPercent,
    };
  });
  const slices: AllocationSlice[] = [
    {
      key: CASH_KEY,
      kind: 'cash',
      value: cashValue,
      weightPercent: weightOf(cashValue),
      concentrated: false,
    },
    ...assetSlices,
  ];

  const concentratedSymbols = assetSlices
    .filter((slice) => slice.concentrated)
    .map((slice) => slice.key);
  const largestAssetWeightPercent = assetSlices.reduce(
    (max, slice) => Math.max(max, slice.weightPercent),
    0,
  );

  let status: DiversificationStatus;
  let message: string;
  if (assetSlices.length === 0) {
    status = 'empty';
    message = 'Aucune position : le portefeuille est entièrement en cash.';
  } else if (concentratedSymbols.length > 0) {
    status = 'warning';
    message =
      `Portefeuille peu diversifié : ${concentratedSymbols.join(', ')} ` +
      `dépasse${concentratedSymbols.length > 1 ? 'nt' : ''} ${thresholdPercent} % de la valeur totale.`;
  } else {
    status = 'ok';
    message = `Aucun actif ne dépasse ${thresholdPercent} % du portefeuille.`;
  }

  return {
    totalValue,
    cashValue,
    investedValue,
    thresholdPercent,
    slices,
    concentratedSymbols,
    largestAssetWeightPercent,
    status,
    message,
  };
}

/** Poids (en %) de chaque actif et du cash, sous forme de dictionnaire. */
export function computeWeights(cash: number, holdings: Holding[]): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const slice of computeAllocation(cash, holdings).slices) {
    weights[slice.key] = slice.weightPercent;
  }
  return weights;
}

/**
 * Poids (en %) qu'aurait `symbol` si l'on y achetait pour `amount` : le cash
 * baisse et la valeur de l'actif monte du même montant, le total ne change
 * pas. Utile pour refuser un ordre avant de l'exécuter (module de risque).
 */
export function weightAfterBuy(
  cash: number,
  holdings: Holding[],
  symbol: string,
  amount: number,
): number {
  const spend = Math.min(Math.max(0, amount), Math.max(0, cash));
  const adjusted = holdings.map((holding) => ({ ...holding }));
  const target = adjusted.find((holding) => holding.symbol === symbol);
  if (target) {
    target.quantity += target.price > 0 ? spend / target.price : 0;
  } else if (spend > 0) {
    adjusted.push({ symbol, quantity: spend, price: 1 });
  }
  const allocation = computeAllocation(cash - spend, adjusted);
  return allocation.slices.find((slice) => slice.key === symbol)?.weightPercent ?? 0;
}
