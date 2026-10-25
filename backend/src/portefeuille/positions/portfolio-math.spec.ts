import { describe, expect, it } from 'vitest';
import {
  buildPositionCycles,
  computeAllocation,
  computeWeights,
  type ExecutionRecord,
  valuePosition,
  weightAfterBuy,
} from './portfolio-math.js';

let seq = 0;
function exec(
  symbol: string,
  side: 'buy' | 'sell',
  quantity: number,
  price: number,
  at: string,
): ExecutionRecord {
  seq += 1;
  return {
    id: `e${String(seq).padStart(3, '0')}`,
    symbol,
    side,
    quantity,
    price,
    amount: Math.round((quantity * price + Number.EPSILON) * 100) / 100,
    executedAt: new Date(at),
  };
}

describe('buildPositionCycles', () => {
  it("reproduit l'exemple des pommes (prix moyen 3, réalisé 10 puis 25)", () => {
    const afterSecondBuy = buildPositionCycles([
      exec('POMME', 'buy', 10, 2, '2026-10-01T10:00:00Z'),
      exec('POMME', 'buy', 10, 4, '2026-10-02T10:00:00Z'),
    ]);
    expect(afterSecondBuy).toHaveLength(1);
    expect(afterSecondBuy[0]).toMatchObject({
      status: 'open',
      quantity: 20,
      averagePrice: 3,
      totalCost: 60,
      realizedPnl: 0,
      returnPercent: null,
    });

    const history = [
      exec('POMME', 'buy', 10, 2, '2026-10-01T10:00:00Z'),
      exec('POMME', 'buy', 10, 4, '2026-10-02T10:00:00Z'),
      exec('POMME', 'sell', 5, 5, '2026-10-03T10:00:00Z'),
    ];
    const partial = buildPositionCycles(history)[0];
    expect(partial).toMatchObject({
      status: 'open',
      quantity: 15,
      averagePrice: 3, // une vente ne change pas le prix moyen
      realizedPnl: 10,
    });

    const [closed] = buildPositionCycles([
      ...history,
      exec('POMME', 'sell', 15, 4, '2026-10-04T10:00:00Z'),
    ]);
    expect(closed).toMatchObject({
      status: 'closed',
      quantity: 0,
      averagePrice: 0,
      totalBought: 20,
      totalSold: 20,
      totalCost: 60,
      totalProceeds: 85,
      averageBuyPrice: 3,
      averageSellPrice: 4.25,
      realizedPnl: 25,
      returnPercent: 41.67,
      executionCount: 4,
    });
    expect(closed.closedAt).toEqual(new Date('2026-10-04T10:00:00Z'));
  });

  it("reproduit l'exemple AAPL (+155 $ sur 4 745 $, soit +3,27 %)", () => {
    const [cycle] = buildPositionCycles([
      exec('AAPL', 'buy', 10, 224.5, '2026-10-01T10:00:00Z'),
      exec('AAPL', 'buy', 10, 250, '2026-10-01T11:00:00Z'),
      exec('AAPL', 'sell', 5, 260, '2026-10-01T12:00:00Z'),
      exec('AAPL', 'sell', 15, 240, '2026-10-01T13:00:00Z'),
    ]);
    expect(cycle.averageBuyPrice).toBe(237.25);
    expect(cycle.totalCost).toBe(4745);
    expect(cycle.realizedPnl).toBe(155);
    expect(cycle.returnPercent).toBe(3.27);
    expect(cycle.status).toBe('closed');
  });

  it('calcule une perte et un rendement négatif', () => {
    const [cycle] = buildPositionCycles([
      exec('BTC/USD', 'buy', 0.5, 70000, '2026-10-01T10:00:00Z'),
      exec('BTC/USD', 'sell', 0.5, 63000, '2026-10-02T10:00:00Z'),
    ]);
    expect(cycle.realizedPnl).toBe(-3500);
    expect(cycle.returnPercent).toBe(-10);
  });

  it('ouvre un nouveau cycle quand on rachète après avoir tout vendu', () => {
    const cycles = buildPositionCycles([
      exec('AAPL', 'buy', 10, 200, '2026-10-01T10:00:00Z'),
      exec('AAPL', 'sell', 10, 210, '2026-10-02T10:00:00Z'),
      exec('AAPL', 'buy', 4, 220, '2026-10-03T10:00:00Z'),
    ]);
    expect(cycles.map((c) => c.status)).toEqual(['closed', 'open']);
    expect(cycles[0].realizedPnl).toBe(100);
    expect(cycles[1]).toMatchObject({ quantity: 4, averagePrice: 220, realizedPnl: 0 });
  });

  it('traite chaque actif séparément et trie : fermés récents d’abord, puis ouverts par symbole', () => {
    const cycles = buildPositionCycles([
      exec('XAU/USD', 'buy', 1, 2000, '2026-10-01T10:00:00Z'),
      exec('AAPL', 'buy', 1, 200, '2026-10-01T11:00:00Z'),
      exec('EUR/USD', 'buy', 100, 1.08, '2026-10-01T12:00:00Z'),
      exec('EUR/USD', 'sell', 100, 1.1, '2026-10-02T12:00:00Z'),
      exec('XAU/USD', 'sell', 1, 2100, '2026-10-03T12:00:00Z'),
    ]);
    expect(cycles.map((c) => `${c.symbol}:${c.status}`)).toEqual([
      'XAU/USD:closed',
      'EUR/USD:closed',
      'AAPL:open',
    ]);
  });

  it("ne dépend pas de l'ordre du tableau d'entrée", () => {
    const rows = [
      exec('AAPL', 'sell', 5, 230, '2026-10-02T10:00:00Z'),
      exec('AAPL', 'buy', 10, 220, '2026-10-01T10:00:00Z'),
    ];
    const [cycle] = buildPositionCycles(rows);
    expect(cycle).toMatchObject({ quantity: 5, realizedPnl: 50 });
  });

  it('plafonne une vente supérieure à la quantité et ignore une vente sans position', () => {
    const cycles = buildPositionCycles([
      exec('AAPL', 'sell', 3, 200, '2026-10-01T09:00:00Z'),
      exec('AAPL', 'buy', 2, 200, '2026-10-01T10:00:00Z'),
      exec('AAPL', 'sell', 5, 210, '2026-10-01T11:00:00Z'),
    ]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({ status: 'closed', totalSold: 2, realizedPnl: 20 });
  });

  it('solde une position malgré les décimales (0,1 + 0,2 puis vente de 0,3)', () => {
    const [cycle] = buildPositionCycles([
      exec('BTC/USD', 'buy', 0.1, 60000, '2026-10-01T10:00:00Z'),
      exec('BTC/USD', 'buy', 0.2, 60000, '2026-10-01T11:00:00Z'),
      exec('BTC/USD', 'sell', 0.3, 60000, '2026-10-01T12:00:00Z'),
    ]);
    expect(cycle.status).toBe('closed');
    expect(cycle.realizedPnl).toBe(0);
  });

  it("renvoie une liste vide sans exécution", () => {
    expect(buildPositionCycles([])).toEqual([]);
  });
});

describe('valuePosition', () => {
  it('calcule le P&L latent et son pourcentage', () => {
    const view = valuePosition(20, 237.25, 260);
    expect(view.marketValue).toBe(5200);
    expect(view.costBasis).toBe(4745);
    expect(view.unrealizedPnl).toBe(455);
    expect(view.unrealizedPercent).toBe(9.59);
  });

  it('donne 0 quand le prix actuel égale le prix moyen (prix fixes)', () => {
    expect(valuePosition(10, 224.5, 224.5).unrealizedPnl).toBe(0);
  });

  it('gère un coût nul sans diviser par zéro', () => {
    expect(valuePosition(0, 0, 100).unrealizedPercent).toBe(0);
  });
});

describe('computeAllocation', () => {
  it("reproduit l'exemple 70 % cash / 20 % pommes / 10 % poires", () => {
    const result = computeAllocation(70, [
      { symbol: 'POMME', quantity: 10, price: 2 },
      { symbol: 'POIRE', quantity: 10, price: 1 },
    ]);
    expect(result.totalValue).toBe(100);
    expect(result.slices.map((s) => [s.key, s.weightPercent])).toEqual([
      ['CASH', 70],
      ['POMME', 20],
      ['POIRE', 10],
    ]);
    expect(result.status).toBe('ok');
    expect(result.concentratedSymbols).toEqual([]);
  });

  it('alerte quand un actif dépasse 30 %', () => {
    const result = computeAllocation(50, [{ symbol: 'POMME', quantity: 50, price: 1 }]);
    expect(result.status).toBe('warning');
    expect(result.concentratedSymbols).toEqual(['POMME']);
    expect(result.message).toContain('POMME');
    expect(result.slices.find((s) => s.key === 'POMME')?.concentrated).toBe(true);
  });

  it("n'alerte pas à exactement 30 % (le seuil est strict)", () => {
    const result = computeAllocation(70, [{ symbol: 'AAPL', quantity: 30, price: 1 }]);
    expect(result.status).toBe('ok');
  });

  it("ne déclenche jamais l'alerte pour le cash, même à 90 %", () => {
    const result = computeAllocation(90, [{ symbol: 'AAPL', quantity: 10, price: 1 }]);
    expect(result.slices[0]).toMatchObject({ key: 'CASH', weightPercent: 90, concentrated: false });
    expect(result.status).toBe('ok');
  });

  it('accorde le pluriel quand plusieurs actifs dépassent le seuil', () => {
    const result = computeAllocation(0, [
      { symbol: 'AAPL', quantity: 50, price: 1 },
      { symbol: 'BTC/USD', quantity: 50, price: 1 },
    ]);
    expect(result.concentratedSymbols).toEqual(['AAPL', 'BTC/USD']);
    expect(result.message).toContain('dépassent');
  });

  it('range les actifs du plus lourd au plus léger, cash en premier', () => {
    const result = computeAllocation(10, [
      { symbol: 'B', quantity: 1, price: 20 },
      { symbol: 'A', quantity: 1, price: 70 },
    ]);
    expect(result.slices.map((s) => s.key)).toEqual(['CASH', 'A', 'B']);
    expect(result.largestAssetWeightPercent).toBe(70);
  });

  it('indique un portefeuille entièrement en cash', () => {
    const result = computeAllocation(100000, []);
    expect(result.status).toBe('empty');
    expect(result.slices).toHaveLength(1);
    expect(result.slices[0].weightPercent).toBe(100);
  });

  it('ignore les positions nulles et supporte un total à zéro', () => {
    const result = computeAllocation(0, [{ symbol: 'AAPL', quantity: 0, price: 224.5 }]);
    expect(result.totalValue).toBe(0);
    expect(result.slices).toEqual([
      { key: 'CASH', kind: 'cash', value: 0, weightPercent: 0, concentrated: false },
    ]);
    expect(result.status).toBe('empty');
  });

  it('accepte un seuil personnalisé', () => {
    const result = computeAllocation(
      80,
      [{ symbol: 'AAPL', quantity: 20, price: 1 }],
      10,
    );
    expect(result.status).toBe('warning');
    expect(result.thresholdPercent).toBe(10);
  });
});

describe('computeWeights et weightAfterBuy (usage par le module de risque)', () => {
  const holdings = [{ symbol: 'AAPL', quantity: 10, price: 100 }];

  it('renvoie un dictionnaire symbole → poids', () => {
    expect(computeWeights(9000, holdings)).toEqual({ CASH: 90, AAPL: 10 });
  });

  it("calcule le poids d'un actif après un achat simulé", () => {
    // 10 % + 25 000 $ sur 100 000 $ → 26 000 / 100 000 = 26 %
    const total = { symbol: 'AAPL', quantity: 10, price: 100 };
    const weight = weightAfterBuy(99000, [total], 'AAPL', 25000);
    expect(weight).toBe(26);
  });

  it('couvre un actif pas encore détenu et un achat supérieur au cash', () => {
    expect(weightAfterBuy(10000, [], 'BTC/USD', 4000)).toBe(40);
    expect(weightAfterBuy(1000, [], 'BTC/USD', 5000)).toBe(100);
  });
});
