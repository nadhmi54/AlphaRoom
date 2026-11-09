import { describe, expect, it } from 'vitest';
import { buildPortfolioValueSeries, returnPercentFromSeries } from './portfolio-value.js';

describe('buildPortfolioValueSeries', () => {
  it('sans exécution, la valeur reste le capital initial', () => {
    const series = buildPortfolioValueSeries({
      initialCash: 1000,
      trades: [],
      prices: {},
      endT: 600,
    });
    expect(series).toEqual([
      { t: 0, value: 1000 },
      { t: 600, value: 1000 },
    ]);
  });

  it('valorise une position longue au prix du scénario', () => {
    const series = buildPortfolioValueSeries({
      initialCash: 1000,
      trades: [{ symbol: 'X', side: 'buy', quantity: 10, price: 10, t: 60 }],
      prices: { X: [{ t: 0, price: 10 }, { t: 600, price: 12 }] },
      endT: 600,
    });
    expect(series).toEqual([
      { t: 0, value: 1000 },
      { t: 60, value: 1000 },
      { t: 600, value: 1020 },
    ]);
  });

  it('donne une valeur de marché négative à une position courte', () => {
    const series = buildPortfolioValueSeries({
      initialCash: 1000,
      trades: [{ symbol: 'X', side: 'sell', quantity: 10, price: 10, t: 60 }],
      prices: { X: [{ t: 0, price: 10 }, { t: 600, price: 8 }] },
      endT: 600,
    });
    // Vente à découvert : la baisse du prix profite au portefeuille (1020).
    expect(series.at(-1)?.value).toBe(1020);
  });

  it('retombe sur le dernier prix d’exécution en l’absence de courbe', () => {
    const series = buildPortfolioValueSeries({
      initialCash: 1000,
      trades: [{ symbol: 'X', side: 'buy', quantity: 5, price: 20, t: 30 }],
      prices: {},
      endT: 120,
    });
    expect(series.at(-1)?.value).toBe(1000);
  });

  it('clôture la courbe à la dernière exécution si aucune fin n’est fournie', () => {
    const series = buildPortfolioValueSeries({
      initialCash: 500,
      trades: [{ symbol: 'X', side: 'buy', quantity: 1, price: 100, t: 90 }],
      prices: { X: [{ t: 0, price: 100 }] },
    });
    expect(series.at(-1)?.t).toBe(90);
  });
});

describe('returnPercentFromSeries', () => {
  it('calcule un rendement en pourcentage', () => {
    expect(returnPercentFromSeries([1000, 1020], 1000)).toBe(2);
  });

  it('vaut 0 sans capital initial ou sans point', () => {
    expect(returnPercentFromSeries([100], 0)).toBe(0);
    expect(returnPercentFromSeries([], 1000)).toBe(0);
  });
});
