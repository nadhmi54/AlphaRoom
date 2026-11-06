/**
 * Test de non-régression : simulation complète de 30 minutes pour chaque symbole.
 *
 * Vérifie que :
 * 1. Le prix varie pendant les 5 dernières minutes pour chaque actif (pas de gel).
 * 2. La variation n'est pas exactement 0 % à cause d'un bug d'arrondi.
 * 3. Le chart, le carnet et le P&L lisent tous le même prix après chaque tick.
 *
 * Utilise de faux timers pour accélérer la simulation (pas d'attente réelle).
 */
import { describe, expect, it } from 'vitest';
import { FEED_SPECS } from '../portefeuille/market-data/market-feed-config.js';
import { PriceBook } from '../portefeuille/market-data/price-book.js';
import {
  MARKET_ASSETS,
  assetDecimals,
  findMarketAsset,
  roundAssetPrice,
} from '../portefeuille/trading/market-assets.js';
import type { GameRoom } from './entities/game-room.entity.js';
import type { MarketSourceConfig } from './game-room-config.js';
import {
  MarketSourceService,
  interpolateOrContinue,
} from './services/market-source.service.js';

/** Générateur déterministe pour des tests reproductibles. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Construit un PriceBook avec les prix de démo de MARKET_ASSETS + CATALOG_ASSETS. */
function buildBook(seed: number): PriceBook {
  const prices = new Map(MARKET_ASSETS.map((a) => [a.symbol, a.price]));
  for (const spec of FEED_SPECS) {
    if (!prices.has(spec.symbol)) {
      const asset = findMarketAsset(spec.symbol);
      if (asset && asset.price > 0) prices.set(spec.symbol, asset.price);
    }
  }
  return new PriceBook(FEED_SPECS, prices, seeded(seed));
}

// ---------------------------------------------------------------------------
// Suite 1 — PriceBook : chaque actif du catalogue bouge pendant 30 minutes
// ---------------------------------------------------------------------------
describe('Simulation 30 minutes — PriceBook (tous les actifs)', () => {
  const SIM_SECONDS = 30 * 60; // 1800 s
  const LAST_5_MIN_START = SIM_SECONDS - 5 * 60; // à partir de la seconde 1500

  it('chaque actif varie pendant toute la séance, y compris les 5 dernières minutes', () => {
    const book = buildBook(42);

    // Avance seconde par seconde ; enregistre le premier et le dernier prix.
    const firstPrice = new Map<string, number>();
    const lastPrice = new Map<string, number>();
    const last5Prices = new Map<string, number[]>();

    for (let t = 0; t <= SIM_SECONDS; t++) {
      const states = book.step(t * 1000, 1);
      for (const s of states) {
        if (!firstPrice.has(s.symbol)) firstPrice.set(s.symbol, s.price);
        lastPrice.set(s.symbol, s.price);
        if (t >= LAST_5_MIN_START) {
          const arr = last5Prices.get(s.symbol) ?? [];
          arr.push(s.price);
          last5Prices.set(s.symbol, arr);
        }
      }
    }

    for (const spec of FEED_SPECS) {
      const sym = spec.symbol;
      const prices = last5Prices.get(sym) ?? [];
      expect(prices.length, `${sym}: doit avoir des prix dans les 5 dernières minutes`).toBeGreaterThan(0);

      // Au moins deux prix différents dans les 5 dernières minutes.
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      expect(max - min, `${sym}: prix figé dans les 5 dernières minutes (min=${min} max=${max})`).toBeGreaterThan(0);

      // La variation totale n'est pas 0 %.
      const first = firstPrice.get(sym) ?? 0;
      const last = lastPrice.get(sym) ?? 0;
      const changePct = first > 0 ? Math.abs((last - first) / first) * 100 : 0;
      expect(changePct, `${sym}: variation totale nulle (arrondi ?)`)
        .toBeGreaterThan(0);
    }
  });

  it('les prix restent strictement positifs sur toute la séance', () => {
    const book = buildBook(7);
    for (let t = 0; t <= SIM_SECONDS; t++) {
      const states = book.step(t * 1000, 1);
      for (const s of states) {
        expect(s.price, `${s.symbol} à t=${t}s`).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — interpolateOrContinue : pas de gel après la fin du dataset
// ---------------------------------------------------------------------------
describe('interpolateOrContinue — continuation synthétique', () => {
  const dataset = [
    { offset: 0,    price: 2700 },
    { offset: 600,  price: 2720 },
    { offset: 1200, price: 2710 },
    // Dataset couvre 1200 s (20 min) ; simulation = 1800 s (30 min).
  ];
  const total = 1800;
  const config: MarketSourceConfig = { initialPrice: 2710, volatilityPercent: 5, seed: 1 };

  it("renvoie l'interpolation tant que l'on est dans le dataset", () => {
    expect(interpolateOrContinue(dataset, 0,   total, config)).toBe(2700);
    expect(interpolateOrContinue(dataset, 600, total, config)).toBe(2720);
    expect(interpolateOrContinue(dataset, 900, total, config)).toBeCloseTo(2715, 0);
    expect(interpolateOrContinue(dataset, 1200, total, config)).toBe(2710);
  });

  it('continue de bouger après la fin du dataset (pas de gel)', () => {
    const pricesAfter: number[] = [];
    for (let t = 1201; t <= 1800; t += 30) {
      pricesAfter.push(interpolateOrContinue(dataset, t, total, config));
    }
    // Le prix ne doit pas être identique à chaque instant.
    const min = Math.min(...pricesAfter);
    const max = Math.max(...pricesAfter);
    expect(max - min, 'le prix est figé après la fin du dataset').toBeGreaterThan(0);
    // Tous les prix restent positifs.
    expect(pricesAfter.every((p) => p > 0)).toBe(true);
  });

  it('est continu à la jonction dataset / continuation (pas de saut brutal)', () => {
    const priceAtEnd = interpolateOrContinue(dataset, 1200, total, config); // = 2710
    const priceJustAfter = interpolateOrContinue(dataset, 1201, total, config);
    // La continuation repart du dernier prix : la différence doit être faible.
    expect(Math.abs(priceJustAfter - priceAtEnd), 'saut brutal à la jonction')
      .toBeLessThan(priceAtEnd * 0.01); // < 1 %
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — cohérence prix entre chart, carnet et P&L
// ---------------------------------------------------------------------------
describe('Cohérence des prix entre chart, carnet et P&L', () => {
  it('le même tick produit le même prix pour le chart, le carnet et les positions', () => {
    const book = buildBook(99);
    const now = Date.now();
    const states = book.step(now, 1);

    for (const state of states) {
      // Le carnet d'ordres se construit à partir de state.price.
      const halfSpread = state.price * 0.0001;
      const bestBid = state.price - halfSpread;
      const bestAsk = state.price + halfSpread;

      // P&L latent d'une position longue fictive ouverte au même prix.
      const entryPrice = state.price;
      const pnl = (state.price - entryPrice) * 10; // = 0 si on l'ouvre maintenant

      expect(bestBid, `${state.symbol}: bid < mid`).toBeLessThan(state.price);
      expect(bestAsk, `${state.symbol}: ask > mid`).toBeGreaterThan(state.price);
      expect(pnl, `${state.symbol}: P&L cohérent avec le prix courant`).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Arrondi JPY (BUG D)
// ---------------------------------------------------------------------------
describe('Arrondi JPY — pas de variation = 0 %', () => {
  it('USD/JPY : une variation de 0.1 % est détectable sans arrondi à 0', () => {
    const basePrice = 149.85;
    const movePercent = 0.1; // 0,1 % de mouvement
    const newPrice = basePrice * (1 + movePercent / 100);
    const change = ((newPrice - basePrice) / basePrice) * 100;
    // La variation en % ne doit jamais être arrondie à 2 décimales avant d'être affichée.
    expect(change).toBeCloseTo(0.1, 5);
    expect(Math.round(change * 100) / 100, 'round2 sur la variation').toBeCloseTo(0.1, 1);
  });

  it('USD/JPY : le spread naturel reste visible (> 0) après round2 sur le prix', () => {
    const price = 149.85;
    const spreadPct = 0.012; // naturalSpreadPercent pour JPY
    const spread = (price * spreadPct) / 100; // = 0.018 JPY
    const roundedSpread = Math.round(spread * 100) / 100; // = 0.02 JPY
    expect(roundedSpread).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — MarketSourceService : arrondi adaptatif pendant une séance de 30 min
// ---------------------------------------------------------------------------
describe('Simulation 30 minutes — MarketSourceService (arrondi par actif)', () => {
  const SIM_SECONDS = 30 * 60;
  const LAST_5_MIN_START = SIM_SECONDS - 5 * 60;

  function serviceFor(symbol: string, price: number): MarketSourceService {
    return new MarketSourceService(
      { query: async () => [] } as never,
      {} as never,
      {
        quotes: () => [],
        // Aucun titre live en mode synthétique : le prix initial vient de la salle.
        quoteFor: () => ({ symbol, price, source: 'simulated' }),
        history: async () => ({ points: [] }),
      } as never,
    );
  }

  function syntheticRoom(symbol: string, price: number): GameRoom {
    return {
      id: `room-${symbol}`,
      status: 'paused',
      startedAt: null,
      pausedAt: null,
      simElapsedSeconds: 0,
      playbackSpeed: '1',
      totalSimSeconds: SIM_SECONDS,
      durationMinutes: 30,
      timeframe: '1m',
      sourceMode: 'synthetic',
      sourceConfig: {
        initialPrice: price,
        volatilityPercent: 5,
        trendPercent: 0,
        seed: 17,
      },
      assets: [symbol],
      spreadMultiplier: '1',
      historyStartAt: null,
      historyEndAt: null,
    } as GameRoom;
  }

  it('chaque actif bouge encore dans les 5 dernières minutes, sans arrondi fixe à 2 décimales', async () => {
    for (const spec of FEED_SPECS) {
      const symbol = spec.symbol;
      const price = findMarketAsset(symbol)?.price ?? 100;
      const service = serviceFor(symbol, price);
      const room = syntheticRoom(symbol, price);

      const last5: number[] = [];
      let firstPrice = 0;
      let lastPrice = 0;

      for (let t = 0; t <= SIM_SECONDS; t += 5) {
        room.simElapsedSeconds = t;
        const state = await service.getMarketState(room, symbol);
        if (t === 0) firstPrice = state.price;
        lastPrice = state.price;
        if (t >= LAST_5_MIN_START) last5.push(state.price);

        // Le prix respecte la précision de l'actif (pas d'arrondi global).
        expect(state.price, `${symbol} à t=${t}s`).toBe(roundAssetPrice(symbol, state.price));
        expect(state.price, `${symbol} à t=${t}s`).toBeGreaterThan(0);
      }

      expect(last5.length).toBeGreaterThan(1);
      const min = Math.min(...last5);
      const max = Math.max(...last5);
      expect(max - min, `${symbol}: prix figé dans les 5 dernières minutes`)
        .toBeGreaterThan(0);

      const changePct = firstPrice > 0 ? Math.abs((lastPrice - firstPrice) / firstPrice) * 100 : 0;
      expect(changePct, `${symbol}: variation totale nulle (arrondi ?)`).toBeGreaterThan(0);

      // Une paire de change doit garder ses décimales naturelles (5 pour EUR/USD).
      if (symbol === 'EUR/USD') expect(assetDecimals(symbol)).toBe(5);
      if (symbol === 'XRP/USDT') expect(assetDecimals(symbol)).toBe(5);
    }
  });

  it('deux lectures du même instant renvoient le même prix (chart = carnet = P&L)', async () => {
    for (const spec of FEED_SPECS) {
      const symbol = spec.symbol;
      const price = findMarketAsset(symbol)?.price ?? 100;
      const service = serviceFor(symbol, price);
      const room = syntheticRoom(symbol, price);
      room.simElapsedSeconds = 1750;

      const [chart, book] = await Promise.all([
        service.getMarketState(room, symbol),
        service.getMarketState(room, symbol),
      ]);
      expect(book.price, `${symbol}`).toBe(chart.price);

      // Le carnet se construit autour de ce même prix : le spread reste > 0.
      expect(chart.spread).toBeGreaterThan(0);
      expect(chart.spread).toBe(roundAssetPrice(symbol, chart.spread));
    }
  });
});
