import { describe, expect, it } from 'vitest';
import { GameRoom } from './entities/game-room.entity.js';
import { MarketSourceService, csvPoints, csvSpanSeconds, interpolate } from './services/market-source.service.js';
import { applyFill, recomputeTotalSimSeconds } from './services/simulation-engine.service.js';

function room(overrides: Partial<GameRoom> = {}): GameRoom {
  return {
    id: 'room-1',
    status: 'running',
    startedAt: new Date('2026-11-01T10:00:00.000Z'),
    pausedAt: null,
    simElapsedSeconds: 0,
    playbackSpeed: '1',
    totalSimSeconds: 1800,
    durationMinutes: 30,
    timeframe: '1m',
    sourceMode: 'scenario',
    sourceConfig: {},
    assets: ['XAU/USD'],
    spreadMultiplier: '1',
    historyStartAt: null,
    historyEndAt: null,
    ...overrides,
  } as GameRoom;
}

function source() {
  return new MarketSourceService(
    { query: async () => [] } as never,
    {} as never,
    {
      quotes: () => [],
      quoteFor: () => null,
      history: async () => ({ points: [] }),
    } as never,
  );
}

describe('Game Room - Horloge de simulation', () => {
  it('avance au rythme de la vitesse de relecture', () => {
    const service = source();
    const now = new Date('2026-11-01T10:00:30.000Z').getTime();
    expect(service.calculateCurrentElapsedSeconds(room({ playbackSpeed: '1' }), now)).toBe(30);
    expect(service.calculateCurrentElapsedSeconds(room({ playbackSpeed: '12' }), now)).toBe(360);
  });

  it('reste figé en pause et reprend à partir de l\'instant sauvegardé', () => {
    const service = source();
    const paused = room({ status: 'paused', simElapsedSeconds: 600, startedAt: null });
    expect(service.calculateCurrentElapsedSeconds(paused, Date.now())).toBe(600);
  });

  it('ne dépasse jamais la durée totale de la séance', () => {
    const service = source();
    const now = new Date('2026-11-01T12:00:00.000Z').getTime();
    expect(service.calculateCurrentElapsedSeconds(room({ totalSimSeconds: 1800 }), now)).toBe(1800);
  });

  it('retombe à zéro tant que la séance n\'est pas lancée', () => {
    const service = source();
    expect(service.calculateCurrentElapsedSeconds(room({ status: 'waiting', startedAt: null }))).toBe(0);
  });
});

describe('Game Room - Séries rejouées (historique / CSV)', () => {
  const points = [
    { offset: 0, price: 100 },
    { offset: 60, price: 110 },
    { offset: 120, price: 90 },
  ];

  it('interpole linéairement entre deux points et borne aux extrémités', () => {
    expect(interpolate(points, -10)).toBe(100);
    expect(interpolate(points, 0)).toBe(100);
    expect(interpolate(points, 30)).toBe(105);
    expect(interpolate(points, 90)).toBe(100);
    expect(interpolate(points, 500)).toBe(90);
  });

  it('indexe les bougies CSV en secondes depuis la première bougie', () => {
    const candles = [
      { timestamp: '2026-10-30T09:01:00Z', open: 1, high: 1, low: 1, close: 2703 },
      { timestamp: '2026-10-30T09:00:00Z', open: 1, high: 1, low: 1, close: 2700 },
    ];
    expect(csvPoints(candles)).toEqual([
      { offset: 0, price: 2700 },
      { offset: 60, price: 2703 },
    ]);
    expect(csvSpanSeconds([])).toBeNull();
    expect(csvSpanSeconds(candles)).toBe(60);
  });
});

describe('Game Room - Comptabilité sur marge', () => {
  const base = { commissionPercent: 0, leverage: 1, held: 0, averagePrice: 0, cash: 100_000 };

  it('règle un achat au comptant quand le levier est de 1', () => {
    const fill = applyFill({ ...base, side: 'buy', quantity: 10, price: 2700 });
    expect(fill.cash).toBe(73_000);
    expect(fill.quantity).toBe(10);
    expect(fill.averagePrice).toBe(2700);
  });

  it('n\'immobilise que la marge avec un levier de 10', () => {
    const fill = applyFill({ ...base, side: 'buy', quantity: 10, price: 2700, leverage: 10 });
    expect(fill.margin).toBe(2700);
    expect(fill.cash).toBe(97_300);
  });

  it('prélève une commission proportionnelle au notionnel', () => {
    const fill = applyFill({ ...base, side: 'buy', quantity: 10, price: 2700, commissionPercent: 0.1 });
    expect(fill.commission).toBe(27);
    expect(fill.cash).toBe(72_973);
  });

  it('réalise le P&L à la clôture et restitue la marge', () => {
    const open = applyFill({ ...base, side: 'buy', quantity: 10, price: 2700, leverage: 10 });
    const close = applyFill({
      ...base,
      side: 'sell',
      quantity: 10,
      price: 2750,
      leverage: 10,
      held: open.quantity,
      averagePrice: open.averagePrice,
      cash: open.cash,
    });
    expect(close.realizedPnl).toBeCloseTo(500, 6);
    expect(close.quantity).toBe(0);
    expect(close.cash).toBeCloseTo(100_000 + 500, 6);
  });

  it('gère une position courte : ouverture puis rachat', () => {
    const open = applyFill({ ...base, side: 'sell', quantity: 5, price: 2700 });
    expect(open.quantity).toBe(-5);
    expect(open.cash).toBe(100_000 - 5 * 2700);

    const close = applyFill({
      ...base,
      side: 'buy',
      quantity: 5,
      price: 2600,
      held: -5,
      averagePrice: 2700,
      cash: open.cash,
    });
    expect(close.realizedPnl).toBeCloseTo(500, 6);
    expect(close.quantity).toBe(0);
    expect(close.cash).toBeCloseTo(100_500, 6);
  });

  it('retourne la position : la moyenne devient le nouveau prix d\'entrée', () => {
    const flip = applyFill({ ...base, side: 'sell', quantity: 8, price: 2700, held: 5, averagePrice: 2650 });
    expect(flip.quantity).toBe(-3);
    expect(flip.averagePrice).toBe(2700);
  });

  it('conserve la durée totale d\'un replay historique quand la vitesse change', () => {
    expect(recomputeTotalSimSeconds(room({ sourceMode: 'historical', totalSimSeconds: 21600, playbackSpeed: '24' }))).toBe(21600);
    expect(recomputeTotalSimSeconds(room({ sourceMode: 'synthetic', durationMinutes: 10, playbackSpeed: '3' }))).toBe(1800);
    expect(recomputeTotalSimSeconds(room({ sourceMode: 'live', durationMinutes: 15, playbackSpeed: '9' }))).toBe(900);
  });
});
