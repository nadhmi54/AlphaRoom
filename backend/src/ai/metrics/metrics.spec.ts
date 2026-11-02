import { describe, expect, it } from 'vitest';
import { buildEquityCurve } from '../contract/equity.js';
import type { SessionData } from '../contract/session-data.js';
import { buildPanicTuesday } from '../fixtures/panic-tuesday.js';
import { computeMetrics } from './metrics.js';
import { buildCycles } from './position-cycles.js';

/**
 * Les valeurs attendues ont été calculées À LA MAIN à partir des prix du
 * scénario « mardi de la panique » (voir fixtures/panic-tuesday.ts).
 */
const session = buildPanicTuesday();

describe('computeMetrics — Amine (très exposé, aucune protection)', () => {
  const m = computeMetrics(session, 'user-amine');

  it('calcule le P&L et le rendement', () => {
    // cash 100 000 − 34×2 700 = 8 200 ; valeur finale 8 200 + 34×2 640 = 97 960
    expect(m.pnl.value).toBe(-2040);
    expect(m.returnRate.value).toBe(-0.0204);
  });

  it('mesure l’exposition maximale à la minute où elle est atteinte', () => {
    // 91 800 / 100 000 = 0,918 dès la minute 5
    expect(m.maxExposure.value).toBe(0.918);
    expect(m.maxExposure.evidence).toContainEqual({ type: 'minute', value: 5 });
    expect(m.maxExposure.evidence).toContainEqual({ type: 'trade', id: 'a1' });
  });

  it('mesure le drawdown maximal entre le sommet et le creux', () => {
    // sommet 100 000 (minute 0), creux 97 246 à la minute 22 → −2 754 / 100 000
    expect(m.maxDrawdown.value).toBe(-0.02754);
    expect(m.maxDrawdown.evidence).toEqual([
      { type: 'minute', value: 0 },
      { type: 'minute', value: 22 },
    ]);
  });

  it('n’a ni gagnante ni perdante fermée, et aucune protection', () => {
    expect(m.winRate.value).toBeNull();
    expect(m.payoffRatio.value).toBeNull();
    expect(m.stopLossRatio.value).toBe(0);
    expect(m.openPositions).toBe(1);
  });

  it('compte le slippage de l’achat : (2 700 − 2 699) × 34', () => {
    expect(m.slippagePaid.value).toBe(34);
    expect(m.slippagePaid.evidence).toEqual([{ type: 'trade', id: 'a1' }]);
  });

  it('constate l’absence de réaction à la NEWS et au choc', () => {
    expect(m.reactionDelays.value.map((r) => [r.eventId, r.minutes])).toEqual([
      ['ev-news', null],
      ['ev-shock', null],
    ]);
  });

  it('a une concentration de 100 % (un seul actif)', () => {
    expect(m.concentration.value).toBe(1);
  });
});

describe('computeMetrics — Sarra (prudente)', () => {
  const m = computeMetrics(session, 'user-sarra');

  it('a perdu 200 $ en vendant à 2 680', () => {
    // (2 680 − 2 700) × 10 = −200
    expect(m.pnl.value).toBe(-200);
    expect(m.returnRate.value).toBe(-0.002);
  });

  it('a une exposition modérée et un stop-loss sur sa position', () => {
    expect(m.maxExposure.value).toBe(0.27);
    expect(m.stopLossRatio.value).toBe(1);
  });

  it('réagit 2 minutes après la NEWS', () => {
    const news = m.reactionDelays.value.find((r) => r.eventId === 'ev-news');
    expect(news).toMatchObject({ minutes: 2, tradeId: 's2' });
  });

  it('a une position fermée perdante : taux de réussite 0, ratio gain/perte inconnu', () => {
    expect(m.closedPositions).toBe(1);
    expect(m.winRate.value).toBe(0);
    expect(m.payoffRatio.value).toBeNull();
  });

  it('chiffre le slippage de la vente : (2 681 − 2 680) × 10', () => {
    expect(m.slippagePaid.value).toBe(10);
  });
});

describe('computeMetrics — Karim (réaction tardive, un gain et une perte)', () => {
  const m = computeMetrics(session, 'user-karim');

  it('a un P&L de −1 010 $', () => {
    // perte −1 220 (20 oz de 2 680 à 2 619) + gain +210 (10 oz de 2 619 à 2 640)
    expect(m.pnl.value).toBe(-1010);
  });

  it('a gagné une fois sur deux, avec un petit gain face à une grosse perte', () => {
    expect(m.winRate.value).toBe(0.5);
    // 210 / 1 220
    expect(m.payoffRatio.value).toBe(0.172131);
  });

  it('a perdu 1 220 $ au plus bas : drawdown −1,22 %', () => {
    expect(m.maxDrawdown.value).toBe(-0.0122);
  });

  it('réagit 1 minute après la NEWS et 2 minutes après le choc', () => {
    expect(m.reactionDelays.value.map((r) => [r.eventId, r.minutes])).toEqual([
      ['ev-news', 1],
      ['ev-shock', 2],
    ]);
  });

  it('n’a posé aucun stop-loss sur ses deux positions', () => {
    expect(m.stopLossRatio.value).toBe(0);
  });

  it('cumule 20 $ de slippage sur sa vente à 2 619', () => {
    expect(m.slippagePaid.value).toBe(20);
  });
});

describe('computeMetrics — Lina (ne trade pas)', () => {
  const m = computeMetrics(session, 'user-lina');

  it('reste à zéro et signale l’absence de données plutôt que d’inventer', () => {
    expect(m.pnl.value).toBe(0);
    expect(m.maxExposure.value).toBe(0);
    expect(m.maxDrawdown.value).toBe(0);
    expect(m.winRate.value).toBeNull();
    expect(m.stopLossRatio.value).toBeNull();
    expect(m.slippagePaid.value).toBeNull();
    expect(m.concentration.value).toBeNull();
    expect(m.missingData).toContain('no_trades');
  });
});

describe('computeMetrics — cas limites', () => {
  it('rejette un participant inconnu', () => {
    expect(() => computeMetrics(session, 'inconnu')).toThrow('Participant introuvable');
  });

  it('signale l’absence de prix attendus au lieu de chiffrer un slippage', () => {
    const trades = [{ id: 't1', minute: 1, symbol: 'XAU/USD', side: 'buy' as const, quantity: 1, price: 2700 }];
    const custom: SessionData = {
      ...session,
      participants: [
        { id: 'p', displayName: 'P', trades, protections: [], equity: buildEquityCurve(100000, trades, session.prices, 30) },
      ],
    };
    const m = computeMetrics(custom, 'p');
    expect(m.slippagePaid.value).toBeNull();
    expect(m.missingData).toContain('no_expected_price');
  });

  it('ne compte pas comme réaction une exécution trop éloignée de l’événement', () => {
    const m = computeMetrics(session, 'user-karim', { reactionWindowMinutes: 0 });
    // fenêtre nulle : seule une exécution à la minute exacte compte → aucune ici
    expect(m.reactionDelays.value.every((r) => r.minutes === null)).toBe(true);
  });

  it('calcule la concentration sur plusieurs actifs', () => {
    const prices = [
      ...session.prices,
      ...session.prices.map((p) => ({ ...p, symbol: 'BTC/USD', price: 1000 })),
    ];
    const trades = [
      { id: 'x1', minute: 1, symbol: 'XAU/USD', side: 'buy' as const, quantity: 10, price: 2700 }, // 27 000
      { id: 'x2', minute: 1, symbol: 'BTC/USD', side: 'buy' as const, quantity: 9, price: 1000 }, // 9 000
    ];
    const custom: SessionData = {
      ...session,
      prices,
      symbols: ['XAU/USD', 'BTC/USD'],
      participants: [
        { id: 'p', displayName: 'P', trades, protections: [], equity: buildEquityCurve(100000, trades, prices, 30) },
      ],
    };
    // 27 000 / 36 000 = 0,75
    expect(computeMetrics(custom, 'p').concentration.value).toBe(0.75);
  });
});

describe('buildCycles', () => {
  it('ouvre un nouveau cycle quand on rachète après avoir tout vendu', () => {
    const { cycles } = buildCycles([
      { id: '1', minute: 1, symbol: 'X', side: 'buy', quantity: 1, price: 10 },
      { id: '2', minute: 2, symbol: 'X', side: 'sell', quantity: 1, price: 12 },
      { id: '3', minute: 3, symbol: 'X', side: 'buy', quantity: 1, price: 11 },
    ]);
    expect(cycles).toHaveLength(2);
    expect(cycles[0]).toMatchObject({ status: 'closed', realizedPnl: 2 });
    expect(cycles[1]).toMatchObject({ status: 'open', averageCost: 11 });
  });

  it('utilise le prix moyen pondéré', () => {
    const { cycles } = buildCycles([
      { id: '1', minute: 1, symbol: 'X', side: 'buy', quantity: 1, price: 10 },
      { id: '2', minute: 2, symbol: 'X', side: 'buy', quantity: 3, price: 20 },
    ]);
    expect(cycles[0]?.averageCost).toBe(17.5);
  });

  it('signale une vente supérieure à la quantité détenue', () => {
    const { anomalies } = buildCycles([
      { id: '1', minute: 1, symbol: 'X', side: 'buy', quantity: 1, price: 10 },
      { id: '2', minute: 2, symbol: 'X', side: 'sell', quantity: 3, price: 12 },
    ]);
    expect(anomalies).toEqual(['2']);
  });
});
