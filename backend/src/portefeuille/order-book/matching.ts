/**
 * Cœur du carnet d'ordres : appariement prix / temps.
 *
 * Ce fichier est volontairement **pur** (aucun accès base, aucune dépendance
 * Nest) : c'est la partie où une erreur est irréparable (priorité FIFO, prix
 * moyen, exécutions partielles), donc celle qui doit être testable seule.
 *
 * Règles implémentées :
 * - un ordre au marché (`market`) consomme le carnet du meilleur prix au plus
 *   mauvais, sans condition de prix, et ne reste jamais en attente ;
 * - un ordre limite (`limit`) ne s'exécute que si le carnet croise son prix ;
 *   le reliquat reste dans le carnet ;
 * - à prix égal, l'ordre arrivé en premier passe en premier (`seq`) ;
 * - un compte ne peut pas s'auto-apparier : ses propres ordres sont ignorés
 *   dans le carnet (il passe au prix suivant disponible) ;
 * - le prix d'une exécution est **celui de l'ordre présent dans le carnet**
 *   (l'ordre exécutant « prend » le prix affiché), jamais celui de l'ordre
 *   entrant.
 */

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';

/** Nombre de décimales utilisé par les colonnes numeric de Postgres. */
export const QUANTITY_SCALE = 6;
export const PRICE_SCALE = 4;
export const AMOUNT_SCALE = 2;

/** Tolérance des comparaisons de quantités (arrondies à 6 décimales). */
const EPSILON = 1e-9;

export interface RestingOrder {
  id: string;
  /** `null` = liquidité système (marché simulé), sans contrepartie comptable. */
  ownerId: string | null;
  side: OrderSide;
  /** Prix limite de l'ordre qui attend dans le carnet. */
  price: number;
  remaining: number;
  /** Ordre d'arrivée, strictement croissant : départage les prix égaux. */
  seq: number;
}

export interface TakerOrder {
  ownerId: string | null;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  /** Obligatoire pour un ordre limite, ignoré pour un ordre au marché. */
  limitPrice?: number | null;
}

export interface PlannedFill {
  makerOrderId: string;
  makerOwnerId: string | null;
  price: number;
  quantity: number;
  /** Montant débité/crédité, arrondi au centime. */
  amount: number;
}

export interface MatchPlan {
  fills: PlannedFill[];
  filledQuantity: number;
  /** Quantité restante de l'ordre entrant après appariement. */
  remainingQuantity: number;
  notional: number;
  /** Prix moyen des exécutions, arrondi à 4 décimales. */
  averagePrice: number;
  /** Quantité qui va rester dans le carnet (ordre limite non totalement servi). */
  restingQuantity: number;
  /** Quantité annulée faute de contrepartie (ordre au marché). */
  cancelledQuantity: number;
}

export function roundTo(value: number, scale: number): number {
  const factor = 10 ** scale;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export const roundQuantity = (value: number) => roundTo(value, QUANTITY_SCALE);
export const roundPrice = (value: number) => roundTo(value, PRICE_SCALE);
export const roundAmount = (value: number) => roundTo(value, AMOUNT_SCALE);

/**
 * Ordre de parcours du carnet : les asks du prix le plus bas au plus haut, les
 * bids du prix le plus haut au plus bas, puis par ordre d'arrivée.
 */
export function sortRestingOrders(orders: readonly RestingOrder[]): RestingOrder[] {
  return [...orders].sort((left, right) => {
    if (left.side !== right.side) return left.side === 'sell' ? -1 : 1;
    if (left.price !== right.price) {
      return left.side === 'sell' ? left.price - right.price : right.price - left.price;
    }
    return left.seq - right.seq;
  });
}

/** Vrai si l'ordre entrant accepte de traiter au prix proposé par le carnet. */
export function acceptsPrice(taker: TakerOrder, makerPrice: number): boolean {
  if (taker.type === 'market') return true;
  if (taker.limitPrice === null || taker.limitPrice === undefined) return false;
  return taker.side === 'buy' ? makerPrice <= taker.limitPrice : makerPrice >= taker.limitPrice;
}

/**
 * Calcule les exécutions d'un ordre entrant contre le carnet, sans rien écrire.
 * `resting` peut contenir les deux côtés : seul le côté opposé est utilisé.
 */
export function matchOrder(
  taker: TakerOrder,
  resting: readonly RestingOrder[],
): MatchPlan {
  const wanted = roundQuantity(taker.quantity);
  const fills: PlannedFill[] = [];
  let remaining = wanted;

  if (wanted > EPSILON) {
    const oppositeSide: OrderSide = taker.side === 'buy' ? 'sell' : 'buy';
    const candidates = sortRestingOrders(
      resting.filter((order) => order.side === oppositeSide && order.remaining > EPSILON),
    );

    for (const maker of candidates) {
      if (remaining <= EPSILON) break;
      // Interdiction de s'auto-apparier : on laisse l'ordre en place et on
      // cherche la contrepartie suivante.
      if (taker.ownerId !== null && maker.ownerId === taker.ownerId) continue;
      if (!acceptsPrice(taker, maker.price)) break; // carnet trié : la suite est pire.

      const quantity = roundQuantity(Math.min(remaining, maker.remaining));
      if (quantity <= EPSILON) continue;

      const amount = roundAmount(quantity * maker.price);
      if (amount <= 0) {
        throw new Error(
          `Exécution trop petite pour être comptabilisée (${quantity} × ${maker.price}).`,
        );
      }

      fills.push({
        makerOrderId: maker.id,
        makerOwnerId: maker.ownerId,
        price: roundPrice(maker.price),
        quantity,
        amount,
      });
      remaining = roundQuantity(remaining - quantity);
    }
  }

  const filledQuantity = roundQuantity(fills.reduce((sum, fill) => sum + fill.quantity, 0));
  const notional = roundAmount(fills.reduce((sum, fill) => sum + fill.amount, 0));
  // Prix moyen = VWAP **des exécutions**, pas `notional / quantité` : le
  // notional est arrondi au centime par exécution, donc le rapport dérive de
  // quelques centièmes de dollar. Une seule exécution à 2 686,742 $ doit
  // afficher 2 686,74 $, pas 2 686,76 $ (arrondi de 671,69 / 0,25).
  const tradedValue = fills.reduce((sum, fill) => sum + fill.quantity * fill.price, 0);
  const leftover = roundQuantity(wanted - filledQuantity);

  return {
    fills,
    filledQuantity,
    remainingQuantity: leftover,
    notional,
    averagePrice: filledQuantity > EPSILON ? roundPrice(tradedValue / filledQuantity) : 0,
    restingQuantity: taker.type === 'limit' ? leftover : 0,
    cancelledQuantity: taker.type === 'market' ? leftover : 0,
  };
}

/** Regroupe les exécutions successives à un même prix (affichage). */
export function aggregateFills(
  fills: readonly PlannedFill[],
): Array<{ price: number; quantity: number; amount: number }> {
  const levels: Array<{ price: number; quantity: number; amount: number }> = [];
  for (const fill of fills) {
    const current = levels.at(-1);
    if (current && current.price === fill.price) {
      current.quantity = roundQuantity(current.quantity + fill.quantity);
      current.amount = roundAmount(current.amount + fill.amount);
    } else {
      levels.push({ price: fill.price, quantity: fill.quantity, amount: fill.amount });
    }
  }
  return levels;
}

export interface BookLevel {
  price: number;
  quantity: number;
  orders: number;
}

/** Agrège les ordres en attente par prix, du meilleur au plus mauvais. */
export function aggregateLevels(
  orders: readonly RestingOrder[],
  side: OrderSide,
  depth = 20,
): BookLevel[] {
  const levels = new Map<number, BookLevel>();
  for (const order of orders) {
    if (order.side !== side || order.remaining <= EPSILON) continue;
    const price = roundPrice(order.price);
    const level = levels.get(price) ?? { price, quantity: 0, orders: 0 };
    level.quantity = roundQuantity(level.quantity + order.remaining);
    level.orders += 1;
    levels.set(price, level);
  }
  const sorted = [...levels.values()].sort((left, right) =>
    side === 'sell' ? left.price - right.price : right.price - left.price,
  );
  return sorted.slice(0, Math.max(1, depth));
}

/** Écart entre meilleure vente et meilleur achat, `null` si un côté est vide. */
export function computeSpread(
  bids: readonly BookLevel[],
  asks: readonly BookLevel[],
): { bestBid: number | null; bestAsk: number | null; spread: number | null } {
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const spread =
    bestBid !== null && bestAsk !== null ? roundPrice(bestAsk - bestBid) : null;
  return { bestBid, bestAsk, spread };
}
