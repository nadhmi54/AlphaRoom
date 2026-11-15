import { describe, expect, it } from 'vitest';
import { buy, liveSession } from '../fixtures/live-session.js';
import { describeProjection, latestShock, MAX_HORIZON_MINUTES, projectAfterShock, PROJECTION_WARNING } from './shock-projection.js';

const shockEvent = { id: 'ev-shock', minute: 11, type: 'price_shock' as const, label: 'Choc de prix : -3 %' };
/** Prix qui ondule un peu avant le choc, tombe de 2 700 à 2 619 à la minute 11, puis ondule encore. */
const wiggle = (minute: number) => (minute < 11 ? 2700 : 2619) + (minute % 2) * 3;

const session = (options: { minute?: number; priceFor?: (m: number) => number; events?: typeof shockEvent[]; participants?: Parameters<typeof liveSession>[0]['participants'] } = {}) =>
  liveSession({
    minute: options.minute ?? 14,
    priceFor: options.priceFor ?? wiggle,
    events: options.events ?? [shockEvent],
    participants: options.participants ?? [{ id: 'a' }],
  });

describe('projection après choc', () => {
  it('ne renvoie rien sans choc ni quand la séance est terminée', () => {
    expect(projectAfterShock(session({ events: [] }))).toBeNull();
    expect(projectAfterShock(session({ minute: 30 }))).toBeNull();
  });

  it('une simple news n’est pas un choc de marché', () => {
    const news = { id: 'n', minute: 11, type: 'news' as const, label: 'Une news' };
    expect(latestShock(session({ events: [news as never] }))).toBeUndefined();
  });

  it('décrit le choc : prix avant, après, variation et temps écoulé', () => {
    const p = projectAfterShock(session())!;
    expect(p.actif).toBe('XAU/USD');
    expect(p.choc).toMatchObject({ id: 'ev-shock', minute: 11, type: 'price_shock', minutes_ecoulees: 3, recent: true });
    expect(p.choc.prix_avant).toBe(2700);
    expect(p.choc.variation_pct).toBeLessThan(-2);
    expect(p.prix_actuel).toBe(2619);
  });

  it('fournit les dernières minutes réelles autour du choc, sans le futur', () => {
    const p = projectAfterShock(session())!;
    expect(p.historique[0]!.minute).toBe(7);
    expect(p.historique.at(-1)).toEqual({ minute: 14, prix: 2619 });
    expect(p.historique.find((h) => h.minute === 11)!.prix).toBeLessThan(p.historique.find((h) => h.minute === 10)!.prix);
    expect(Math.max(...p.historique.map((h) => h.minute))).toBe(p.minute_actuelle);
  });

  it('un choc ancien n’est plus « récent » mais reste projetable', () => {
    const p = projectAfterShock(session({ minute: 24 }))!;
    expect(p.choc.recent).toBe(false);
    expect(p.horizon_minutes).toBe(6);
  });

  it('l’horizon est borné et ne dépasse jamais la fin de la séance', () => {
    expect(projectAfterShock(session({ minute: 14 }))!.horizon_minutes).toBe(MAX_HORIZON_MINUTES);
    expect(projectAfterShock(session({ minute: 28 }))!.horizon_minutes).toBe(2);
    expect(projectAfterShock(session({ minute: 14 }), { horizon: 3 })!.horizon_minutes).toBe(3);
  });

  it('l’éventail part du prix actuel, est ordonné et s’élargit avec le temps', () => {
    const p = projectAfterShock(session())!;
    const first = p.eventail[0]!;
    expect(first).toMatchObject({ minute: 14, median: 2619, bas_5: 2619, haut_95: 2619 });
    expect(p.eventail).toHaveLength(p.horizon_minutes + 1);
    for (const point of p.eventail) {
      expect(point.bas_5).toBeLessThanOrEqual(point.bas_25);
      expect(point.bas_25).toBeLessThanOrEqual(point.median);
      expect(point.median).toBeLessThanOrEqual(point.haut_75);
      expect(point.haut_75).toBeLessThanOrEqual(point.haut_95);
    }
    const widths = p.eventail.map((x) => x.haut_95 - x.bas_5);
    expect(widths.at(-1)!).toBeGreaterThan(widths[1]!);
  });

  it('n’impose aucune direction : la médiane reste près du prix actuel', () => {
    const p = projectAfterShock(session())!;
    const last = p.eventail.at(-1)!;
    expect(Math.abs(last.median / p.prix_actuel - 1)).toBeLessThan(0.01);
    expect(p.probabilites.finit_au_dessus_du_prix_actuel_pct + p.probabilites.finit_sous_le_prix_actuel_pct).toBeCloseTo(100, 1);
    expect(p.probabilites.finit_au_dessus_du_prix_actuel_pct).toBeGreaterThan(35);
    expect(p.probabilites.finit_au_dessus_du_prix_actuel_pct).toBeLessThan(65);
  });

  it('est reproductible : mêmes données, mêmes chiffres', () => {
    expect(projectAfterShock(session())).toEqual(projectAfterShock(session()));
  });

  it('une volatilité plus forte donne un éventail plus large', () => {
    const calm = projectAfterShock(session({ priceFor: (m) => (m < 11 ? 2700 : 2619) + (m % 2) * 1 }))!;
    const wild = projectAfterShock(session({ priceFor: (m) => (m < 11 ? 2700 : 2619) + (m % 2) * 40 }))!;
    const width = (p: NonNullable<typeof calm>) => p.eventail.at(-1)!.haut_95 - p.eventail.at(-1)!.bas_5;
    expect(width(wild)).toBeGreaterThan(width(calm));
    expect(wild.volatilite.utilisee_au_depart_par_minute_pct).toBeGreaterThan(calm.volatilite.utilisee_au_depart_par_minute_pct);
  });

  it('trois scénarios nommés : retour, rebond partiel, continuation (des hypothèses, sans probabilité)', () => {
    const p = projectAfterShock(session())!;
    expect(p.scenarios.map((s) => s.id)).toEqual(['retour', 'rebond_partiel', 'continuation']);
    const [retour, rebond, suite] = p.scenarios as [typeof p.scenarios[number], typeof p.scenarios[number], typeof p.scenarios[number]];
    expect(retour.niveau_cible).toBe(p.choc.prix_avant);
    expect(rebond.niveau_cible).toBeGreaterThan(p.prix_actuel);
    expect(rebond.niveau_cible).toBeLessThan(retour.niveau_cible);
    expect(suite.niveau_cible).toBeLessThan(p.prix_actuel);
    expect(retour.trajectoire[0]).toEqual({ minute: 14, prix: 2619 });
    expect(retour.trajectoire.at(-1)!.prix).toBeCloseTo(retour.niveau_cible, 0);
    for (const s of p.scenarios) {
      expect(s.description).not.toMatch(/\d/);
      expect(s).not.toHaveProperty('probabilite');
    }
  });

  it('après un choc haussier, la continuation va plus haut et le retour plus bas', () => {
    const up = projectAfterShock(session({ priceFor: (m) => (m < 11 ? 2700 : 2790) + (m % 2) * 3, events: [{ ...shockEvent, label: 'Choc de prix : +3 %' }] }))!;
    expect(up.choc.variation_pct).toBeGreaterThan(2);
    expect(up.scenarios.find((s) => s.id === 'retour')!.niveau_cible).toBeLessThan(up.prix_actuel);
    expect(up.scenarios.find((s) => s.id === 'continuation')!.niveau_cible).toBeGreaterThan(up.prix_actuel);
  });

  it('la probabilité de repasser par le niveau d’avant est plus faible pour un grand écart', () => {
    const near = projectAfterShock(session({ priceFor: (m) => (m < 11 ? 2700 : 2690) + (m % 2) * 3 }))!;
    const far = projectAfterShock(session())!;
    expect(near.probabilites.repasse_par_le_niveau_d_avant_pct).toBeGreaterThan(far.probabilites.repasse_par_le_niveau_d_avant_pct);
  });

  it('personnalise avec la position du trader : gain/perte dans l’éventail et risque que son stop soit touché', () => {
    const s = session({ participants: [{ id: 'a', trades: [buy('t1', 5, 20, 2700)], protections: [{ minute: 5, symbol: 'XAU/USD', stopLoss: 2600, takeProfit: null }] }, { id: 'b' }] });
    const p = projectAfterShock(s, { participantId: 'a' })!;
    expect(p.ta_position).toMatchObject({ quantite: 20, stop_loss: 2600 });
    expect(p.ta_position!.gain_perte_si_bas_5).toBeLessThan(0);
    expect(p.ta_position!.gain_perte_si_haut_95).toBeGreaterThan(0);
    expect(p.ta_position!.probabilite_stop_touche_pct).toBeGreaterThan(0);
    expect(projectAfterShock(s, { participantId: 'b' })!.ta_position).toBeUndefined();
    expect(projectAfterShock(s)!.ta_position).toBeUndefined();
  });

  it('ne voit jamais le futur : seules les minutes jusqu’à maintenant comptent', () => {
    const base = projectAfterShock(session({ minute: 14 }))!;
    const futureSession = liveSession({ minute: 14, priceFor: wiggle, events: [shockEvent, { id: 'later', minute: 22, type: 'price_shock', label: 'Plus tard' }], participants: [{ id: 'a' }] });
    expect(projectAfterShock(futureSession)).toEqual(base);
  });

  it('choisit l’actif le plus déplacé par le choc quand il y en a plusieurs', () => {
    const multi = liveSession({
      minute: 14,
      symbols: ['XAU/USD', 'EUR/USD'],
      priceFor: (m) => (m < 11 ? 100 : 100) + (m % 2),
      events: [shockEvent],
      participants: [{ id: 'a' }],
    });
    // EUR/USD chute à la minute 11 : on reconstruit les prix à la main.
    multi.prices = multi.prices.map((p) => (p.symbol === 'EUR/USD' && p.minute >= 11 ? { ...p, price: 90 + (p.minute % 2) } : p));
    expect(projectAfterShock(multi)!.actif).toBe('EUR/USD');
    expect(projectAfterShock(multi, { symbol: 'XAU/USD' })!.actif).toBe('XAU/USD');
  });

  it('le texte pédagogique donne la fourchette, les scénarios et l’avertissement, sans conseil d’ordre ni prédiction', () => {
    const s = session({ participants: [{ id: 'a', trades: [buy('t1', 5, 20, 2700)] }] });
    const text = describeProjection(projectAfterShock(s, { participantId: 'a' })!);
    expect(text).toContain('Choc de prix');
    expect(text).toContain('9 cas sur 10');
    expect(text).toContain('Retour au niveau d’avant');
    expect(text).toContain('Tu n’as pas de stop-loss');
    expect(text).toContain(PROJECTION_WARNING);
    expect(text).not.toMatch(/achète|vends|va (monter|baisser|remonter)|garanti/i);
  });
});
