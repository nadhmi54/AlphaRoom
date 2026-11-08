import { describe, expect, it } from 'vitest';
import { trending } from './test-data.js';
import { dailyVolatility, describeSimulation, hashSeed, seededRandom, simulateOutcomes } from './montecarlo.js';

/** Prix qui oscillent de ±pct autour de 100 : volatilité contrôlée. */
const zigzag = (n: number, pct: number) => Array.from({ length: n }, (_, i) => 100 * (1 + (i % 2 === 0 ? pct : -pct)));

describe('Monte Carlo', () => {
  it('le générateur est reproductible et uniforme', () => {
    const a = seededRandom(hashSeed('XAU/USD'));
    const b = seededRandom(hashSeed('XAU/USD'));
    const xs = Array.from({ length: 2000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 2000 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(xs.reduce((s, x) => s + x, 0) / xs.length).toBeCloseTo(0.5, 1);
  });

  it('mêmes entrées → mêmes chiffres', () => {
    const closes = zigzag(80, 0.01);
    expect(simulateOutcomes({ closes, days: 5, seedKey: 'A' })).toEqual(simulateOutcomes({ closes, days: 5, seedKey: 'A' }));
  });

  it('une volatilité nulle ne produit aucune perte ni aucun gain', () => {
    const sim = simulateOutcomes({ closes: Array(80).fill(100), days: 10, seedKey: 'flat' });
    expect(sim.sigma).toBe(0);
    expect(sim.distribution.p5).toBeCloseTo(0, 10);
    expect(sim.probLossBeyond.every((p) => p.prob === 0)).toBe(true);
    expect(sim.probLoss).toBe(0);
  });

  it('l’étendue des issues suit la volatilité et la racine du temps', () => {
    const calm = simulateOutcomes({ closes: zigzag(80, 0.005), days: 5, seedKey: 'x' });
    const wild = simulateOutcomes({ closes: zigzag(80, 0.02), days: 5, seedKey: 'x' });
    expect(wild.distribution.p5).toBeLessThan(calm.distribution.p5);
    expect(wild.distribution.p95).toBeGreaterThan(calm.distribution.p95);
    const short = simulateOutcomes({ closes: zigzag(80, 0.01), days: 1, seedKey: 'y' });
    const long = simulateOutcomes({ closes: zigzag(80, 0.01), days: 16, seedKey: 'y' });
    // 16 jours ≈ 4 × l'écart de 1 jour (racine du temps), à la tolérance de simulation près.
    const spread = (s: typeof short) => s.distribution.p95 - s.distribution.p5;
    expect(spread(long) / spread(short)).toBeGreaterThan(3.4);
    expect(spread(long) / spread(short)).toBeLessThan(4.6);
  });

  it('sans direction supposée : la probabilité de perte est proche de 50 %', () => {
    const sim = simulateOutcomes({ closes: zigzag(80, 0.01), days: 10, seedKey: 'z' });
    expect(sim.probLoss).toBeGreaterThan(0.45);
    expect(sim.probLoss).toBeLessThan(0.56);
  });

  it('les probabilités sont cohérentes entre elles', () => {
    const sim = simulateOutcomes({ closes: zigzag(80, 0.015), days: 10, seedKey: 'c', stopFraction: 0.03 });
    const losses = sim.probLossBeyond.map((p) => p.prob);
    expect([...losses].sort((a, b) => b - a)).toEqual(losses); // plus le seuil est haut, plus c'est rare
    expect(sim.distribution.p5).toBeLessThan(sim.distribution.median);
    expect(sim.distribution.median).toBeLessThan(sim.distribution.p95);
    expect(sim.distribution.expectedShortfall5).toBeLessThanOrEqual(sim.distribution.p5);
  });

  it('un stop plus proche saute plus souvent, et toucher le stop est au moins aussi probable que finir sous lui', () => {
    const closes = zigzag(80, 0.015);
    const near = simulateOutcomes({ closes, days: 10, seedKey: 's', stopFraction: 0.02 });
    const far = simulateOutcomes({ closes, days: 10, seedKey: 's', stopFraction: 0.08 });
    expect(near.probStopTouched!).toBeGreaterThan(far.probStopTouched!);
    const endBelow = simulateOutcomes({ closes, days: 10, seedKey: 's', stopFraction: 0.02 }).probLossBeyond.find((p) => p.threshold === 2)!.prob;
    expect(near.probStopTouched!).toBeGreaterThanOrEqual(endBelow);
    expect(simulateOutcomes({ closes, days: 5, seedKey: 's' }).probStopTouched).toBeNull();
  });

  it('estime la volatilité sur les derniers jours seulement', () => {
    const closes = [...zigzag(100, 0.05), ...trending(61, 100, 0.0001)];
    expect(dailyVolatility(closes)).toBeLessThan(0.001);
  });

  it('borne l’horizon et nomme tous les pourcentages avec _pct', () => {
    const sim = simulateOutcomes({ closes: zigzag(80, 0.01), days: 999, seedKey: 'b' });
    expect(sim.days).toBe(60);
    const out = describeSimulation(sim, 252);
    expect(out.jours_simules).toBe(60);
    for (const key of Object.keys(out)) {
      if (/probabilit|resultat|volatilit|perte_moyenne|quartile/.test(key) && typeof (out as Record<string, unknown>)[key] === 'number') expect(key).toMatch(/_pct$/);
    }
  });
});
