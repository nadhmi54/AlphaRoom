import { LIVE_STALE_MS, type FeedSpec } from './market-feed-config.js';
import { simulateStep } from './price-simulator.js';

export type PriceSource = 'live' | 'simulated';

export interface RealTick {
  symbol: string;
  price: number;
  at: number;
}

export interface PriceState {
  symbol: string;
  price: number;
  source: PriceSource;
  /** Instant (ms) du dernier tick réel reçu, null s'il n'y en a jamais eu. */
  lastRealAt: number | null;
}

interface Internal extends PriceState {
  anchor: number;
  lastRealPrice: number | null;
}

/**
 * Prix courant de chaque actif. Tant qu'un prix réel est arrivé récemment, on
 * le suit ; sinon (marché fermé, flux coupé) la simulation prend le relais à
 * partir du dernier prix connu.
 */
export class PriceBook {
  private readonly states = new Map<string, Internal>();
  private readonly volatility = new Map<string, number>();

  constructor(
    specs: readonly FeedSpec[],
    initialPrices: ReadonlyMap<string, number>,
    private readonly random: () => number = Math.random,
  ) {
    for (const spec of specs) {
      const price = initialPrices.get(spec.symbol);
      if (price === undefined || !(price > 0)) continue;
      this.volatility.set(spec.symbol, spec.annualVolatility);
      this.states.set(spec.symbol, {
        symbol: spec.symbol,
        price,
        source: 'simulated',
        lastRealAt: null,
        anchor: price,
        lastRealPrice: null,
      });
    }
  }

  /** Enregistre un prix réel ; il sera repris au prochain `step`. */
  recordReal(tick: RealTick): void {
    const state = this.states.get(tick.symbol);
    if (!state || !(tick.price > 0)) return;
    state.lastRealPrice = tick.price;
    state.lastRealAt = tick.at;
  }

  /** Avance d'un pas de temps et renvoie l'état de chaque actif. */
  step(now: number, dtSeconds: number): PriceState[] {
    const out: PriceState[] = [];
    for (const state of this.states.values()) {
      const fresh =
        state.lastRealAt !== null &&
        state.lastRealPrice !== null &&
        now - state.lastRealAt <= LIVE_STALE_MS;
      if (fresh) {
        state.price = state.lastRealPrice as number;
        state.anchor = state.price;
        state.source = 'live';
      } else {
        state.price = simulateStep(
          state.price,
          state.anchor,
          this.volatility.get(state.symbol) ?? 0.2,
          dtSeconds,
          this.random,
        );
        state.source = 'simulated';
      }
      out.push({
        symbol: state.symbol,
        price: state.price,
        source: state.source,
        lastRealAt: state.lastRealAt,
      });
    }
    return out;
  }

  get(symbol: string): PriceState | undefined {
    const state = this.states.get(symbol);
    return state && { symbol, price: state.price, source: state.source, lastRealAt: state.lastRealAt };
  }
}
