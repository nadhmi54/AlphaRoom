import { describe, expect, it } from 'vitest';
import type { RunSnapshot } from '../../game-room/run-snapshot.js';
import { analyzeMarket } from '../analysis/market-analysis.js';
import { buildSessionData } from './session-builder.js';

const snapshot = (over: Partial<RunSnapshot> = {}): RunSnapshot => ({
  roomId: 'room-1',
  roomName: 'Séance test',
  run: 1,
  elapsedMinutes: 4,
  durationMinutes: 30,
  initialCapital: 100000,
  symbols: ['XAU/USD'],
  sourceMode: 'synthetic',
  scenarioId: 'autre',
  participants: [
    { userId: 'u1', nickname: 'Amine' },
    { userId: 'u2', nickname: 'Lina' },
  ],
  trades: [
    { id: 't1', userId: 'u1', symbol: 'XAU/USD', side: 'buy', quantity: 10, price: 2700, minute: 1, orderId: 'o1' },
    { id: 't2', userId: 'u1', symbol: 'XAU/USD', side: 'sell', quantity: 10, price: 2680, minute: 3, orderId: null },
  ],
  orders: [{ id: 'o1', userId: 'u1', symbol: 'XAU/USD', stopLoss: 2650, takeProfit: null }],
  events: [{ id: 'e1', type: 'NEWS', title: 'Communiqué', minute: 2 }],
  series: { 'XAU/USD': [{ t: 0, price: 2700 }, { t: 120, price: 2690 }, { t: 240, price: 2680 }] },
  ...over,
});

describe('buildSessionData', () => {
  it('produit le contrat de séance : prix par minute, trades, protections, équité', () => {
    const data = buildSessionData(snapshot());
    expect(data).toMatchObject({ sessionId: 'room-1', title: 'Séance test', run: 1, initialCash: 100000, symbols: ['XAU/USD'] });
    expect(data.prices.map((p) => [p.minute, p.price])).toEqual([[0, 2700], [1, 2695], [2, 2690], [3, 2685], [4, 2680]]);

    const amine = data.participants.find((p) => p.id === 'u1')!;
    expect(amine.displayName).toBe('Amine');
    expect(amine.trades).toHaveLength(2);
    // le stop-loss est daté à l'exécution de l'ordre qui le portait
    expect(amine.protections).toEqual([{ minute: 1, symbol: 'XAU/USD', stopLoss: 2650, takeProfit: null }]);

    const equityAt = (m: number) => amine.equity.find((e) => e.minute === m)!;
    expect(equityAt(0)).toEqual({ minute: 0, cash: 100000, positionsValue: 0 });
    // minute 2 : 10 oz achetées à 2700 (cash −27000), valeur 10 × 2690
    expect(equityAt(2)).toEqual({ minute: 2, cash: 73000, positionsValue: 26900 });
    // minute 4 : tout vendu à 2680, perte de 200
    expect(equityAt(4)).toEqual({ minute: 4, cash: 99800, positionsValue: 0 });

    const lina = data.participants.find((p) => p.id === 'u2')!;
    expect(lina.trades).toEqual([]);
    expect(lina.equity.every((e) => e.cash === 100000 && e.positionsValue === 0)).toBe(true);
  });

  it('traduit les événements de la salle et ignore les types inconnus', () => {
    const data = buildSessionData(
      snapshot({ events: [{ id: 'e1', type: 'NEWS', title: 'Annonce', minute: 2 }, { id: 'e2', type: 'AUTRE', title: 'x', minute: 1 }] }),
    );
    expect(data.events).toEqual([{ id: 'e1', minute: 2, type: 'news', label: 'Annonce' }]);
  });

  it('ajoute les news du scénario « mardi de la panique » déjà survenues', () => {
    const early = buildSessionData(snapshot({ sourceMode: 'scenario', scenarioId: 'panic_tuesday', elapsedMinutes: 10, events: [] }));
    expect(early.events).toEqual([]);

    const late = buildSessionData(snapshot({ sourceMode: 'scenario', scenarioId: 'panic_tuesday', elapsedMinutes: 23, events: [] }));
    expect(late.events.map((e) => [e.minute, e.type])).toEqual([[11, 'news'], [22, 'price_shock']]);
    expect(late.events[1]!.label).toContain('FLASH CRASH');
  });

  it('reste lisible par l’Analyste de marché', () => {
    const analysis = analyzeMarket(buildSessionData(snapshot()));
    expect(analysis.symbols[0]).toMatchObject({ symbol: 'XAU/USD', first: 2700, last: 2680 });
    expect(analysis.events[0]).toMatchObject({ type: 'news', participants: 2 });
  });

  it('séance vide : un seul point de prix à la minute 0', () => {
    const data = buildSessionData(snapshot({ elapsedMinutes: 0, trades: [], orders: [], events: [] }));
    expect(data.prices).toEqual([{ minute: 0, symbol: 'XAU/USD', price: 2700 }]);
  });
});
