export interface Quote {
  bid: number;
  ask: number;
  mid: number;
}

export class QuoteCalculator {
  /**
   * Calcule le bid et l'ask autour d'un prix de référence.
   * spreadBps: écart en points de base (1/10000).
   * volatility: facteur d'élargissement du spread (0 à 1).
   * inventory: décalage du mid price (skew) basé sur l'exposition.
   */
  static calculate(
    referencePrice: number,
    spreadBps: number,
    volatility: number,
    inventory: number,
    maxInventory: number,
  ): Quote {
    const spreadPercent = spreadBps / 10000;
    
    // Skew : si on a trop d'inventaire positif, on baisse le prix pour encourager la vente
    const inventoryRisk = inventory / maxInventory;
    const skew = -inventoryRisk * spreadPercent * 0.5;
    
    // Spread effectif : s'élargit avec la volatilité
    const effectiveSpread = spreadPercent * (1 + volatility);
    
    const mid = referencePrice * (1 + skew);
    const bid = mid * (1 - effectiveSpread / 2);
    const ask = mid * (1 + effectiveSpread / 2);

    return {
      mid: this.round(mid),
      bid: this.round(bid),
      ask: this.round(ask),
    };
  }

  private static round(value: number): number {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
  }
}
