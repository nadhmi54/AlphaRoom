import { describe, expect, it } from 'vitest';
import {
  aggregateFills,
  aggregateLevels,
  computeSpread,
  matchOrder,
  sortRestingOrders,
  type RestingOrder,
} from './matching.js';

const resting = (over: Partial<RestingOrder> & { id: string; seq: number }): RestingOrder => ({
  ownerId: `owner-${over.id}`,
  side: 'sell',
  price: 2001,
  remaining: 1,
  ...over,
});

describe('matchOrder — exemple du cahier des charges', () => {
  // « Acheter 15 oz alors qu'il y a 8 oz à 2 001 $ et 10 oz à 2 002 $ donne
  //   8 oz à 2 001 $ et 7 oz à 2 002 $, soit un prix moyen de 2 001,47 $. »
  const book: RestingOrder[] = [
    resting({ id: 'ask-2002', seq: 2, price: 2002, remaining: 10 }),
    resting({ id: 'ask-2001', seq: 1, price: 2001, remaining: 8 }),
  ];

  it('sert 8 oz à 2 001 puis 7 oz à 2 002', () => {
    const plan = matchOrder(
      { ownerId: 'buyer', side: 'buy', type: 'market', quantity: 15 },
      book,
    );

    expect(plan.fills).toEqual([
      { makerOrderId: 'ask-2001', makerOwnerId: 'owner-ask-2001', price: 2001, quantity: 8, amount: 16008 },
      { makerOrderId: 'ask-2002', makerOwnerId: 'owner-ask-2002', price: 2002, quantity: 7, amount: 14014 },
    ]);
    expect(plan.filledQuantity).toBe(15);
    expect(plan.remainingQuantity).toBe(0);
    expect(plan.notional).toBe(30022);
  });

  it('affiche un prix moyen de 2 001,47', () => {
    const plan = matchOrder(
      { ownerId: 'buyer', side: 'buy', type: 'market', quantity: 15 },
      book,
    );

    expect(plan.averagePrice).toBe(2001.4667); // 30 022 / 15, arrondi 4 décimales
    expect(plan.averagePrice.toFixed(2)).toBe('2001.47');
  });

  it('regroupe les exécutions par prix pour l’affichage', () => {
    const plan = matchOrder(
      { ownerId: 'buyer', side: 'buy', type: 'market', quantity: 15 },
      book,
    );

    expect(aggregateFills(plan.fills)).toEqual([
      { price: 2001, quantity: 8, amount: 16008 },
      { price: 2002, quantity: 7, amount: 14014 },
    ]);
  });
});

describe('matchOrder — priorité prix puis FIFO', () => {
  it('consomme le prix le plus bas en premier, quel que soit l’ordre d’insertion', () => {
    const plan = matchOrder({ ownerId: 'buyer', side: 'buy', type: 'market', quantity: 3 }, [
      resting({ id: 'cher', seq: 1, price: 2010, remaining: 5 }),
      resting({ id: 'bon-marche', seq: 2, price: 2005, remaining: 5 }),
    ]);

    expect(plan.fills.map((fill) => fill.makerOrderId)).toEqual(['bon-marche']);
  });

  it('à prix égal, le premier arrivé passe en premier', () => {
    const plan = matchOrder({ ownerId: 'buyer', side: 'buy', type: 'market', quantity: 4 }, [
      resting({ id: 'second', seq: 2, price: 2000, remaining: 5 }),
      resting({ id: 'premier', seq: 1, price: 2000, remaining: 3 }),
    ]);

    expect(plan.fills).toEqual([
      { makerOrderId: 'premier', makerOwnerId: 'owner-premier', price: 2000, quantity: 3, amount: 6000 },
      { makerOrderId: 'second', makerOwnerId: 'owner-second', price: 2000, quantity: 1, amount: 2000 },
    ]);
  });

  it('vend contre les bids du prix le plus haut au plus bas', () => {
    const plan = matchOrder({ ownerId: 'seller', side: 'sell', type: 'market', quantity: 6 }, [
      resting({ id: 'bid-bas', seq: 1, side: 'buy', price: 1990, remaining: 10 }),
      resting({ id: 'bid-haut', seq: 2, side: 'buy', price: 2000, remaining: 2 }),
      resting({ id: 'bid-moyen', seq: 3, side: 'buy', price: 1995, remaining: 10 }),
    ]);

    expect(plan.fills.map((fill) => [fill.makerOrderId, fill.price, fill.quantity])).toEqual([
      ['bid-haut', 2000, 2],
      ['bid-moyen', 1995, 4],
    ]);
    expect(plan.averagePrice).toBe(1996.6667);
  });

  it('trie les deux côtés du carnet dans l’ordre d’affichage', () => {
    const sorted = sortRestingOrders([
      resting({ id: 'a3', seq: 3, side: 'sell', price: 2007 }),
      resting({ id: 'b1', seq: 4, side: 'buy', price: 1998 }),
      resting({ id: 'a1', seq: 1, side: 'sell', price: 1999 }),
      resting({ id: 'b2', seq: 2, side: 'buy', price: 2000 }),
    ]);

    expect(sorted.map((order) => order.id)).toEqual(['a1', 'a3', 'b2', 'b1']);
  });
});

describe('matchOrder — ordres limites', () => {
  const book: RestingOrder[] = [
    resting({ id: 'ask-2001', seq: 1, price: 2001, remaining: 8 }),
    resting({ id: 'ask-2002', seq: 2, price: 2002, remaining: 10 }),
  ];

  it('ne s’exécute pas si le prix ne croise pas le carnet', () => {
    const plan = matchOrder(
      { ownerId: 'buyer', side: 'buy', type: 'limit', quantity: 5, limitPrice: 1995 },
      book,
    );

    expect(plan.fills).toEqual([]);
    expect(plan.filledQuantity).toBe(0);
    expect(plan.restingQuantity).toBe(5);
    expect(plan.cancelledQuantity).toBe(0);
  });

  it('s’exécute partiellement et laisse le reliquat dans le carnet', () => {
    const plan = matchOrder(
      { ownerId: 'buyer', side: 'buy', type: 'limit', quantity: 10, limitPrice: 2001 },
      book,
    );

    expect(plan.filledQuantity).toBe(8);
    expect(plan.restingQuantity).toBe(2);
    expect(plan.fills.map((fill) => fill.price)).toEqual([2001]);
  });

  it('s’arrête dès que le prix suivant dépasse la limite', () => {
    const plan = matchOrder(
      { ownerId: 'buyer', side: 'buy', type: 'limit', quantity: 15, limitPrice: 2001.5 },
      book,
    );

    expect(plan.filledQuantity).toBe(8);
    expect(plan.restingQuantity).toBe(7);
  });

  it('une vente limite traite au prix du bid, meilleur que sa limite', () => {
    const plan = matchOrder(
      { ownerId: 'seller', side: 'sell', type: 'limit', quantity: 2, limitPrice: 1998 },
      [resting({ id: 'bid', seq: 1, side: 'buy', price: 2003, remaining: 5 })],
    );

    expect(plan.fills).toEqual([
      { makerOrderId: 'bid', makerOwnerId: 'owner-bid', price: 2003, quantity: 2, amount: 4006 },
    ]);
    expect(plan.restingQuantity).toBe(0);
  });
});

describe('matchOrder — cas limites', () => {
  it('un ordre au marché sans contrepartie est entièrement annulé', () => {
    const plan = matchOrder({ ownerId: 'buyer', side: 'buy', type: 'market', quantity: 5 }, []);

    expect(plan.fills).toEqual([]);
    expect(plan.cancelledQuantity).toBe(5);
    expect(plan.restingQuantity).toBe(0);
  });

  it('un ordre au marché annule le reliquat une fois le carnet épuisé', () => {
    const plan = matchOrder({ ownerId: 'buyer', side: 'buy', type: 'market', quantity: 15 }, [
      resting({ id: 'ask', seq: 1, price: 2000, remaining: 12 }),
    ]);

    expect(plan.filledQuantity).toBe(12);
    expect(plan.cancelledQuantity).toBe(3);
    expect(plan.restingQuantity).toBe(0);
  });

  it('n’exécute jamais un ordre contre lui-même et prend la contrepartie suivante', () => {
    const plan = matchOrder({ ownerId: 'moi', side: 'buy', type: 'market', quantity: 5 }, [
      resting({ id: 'mon-ask', seq: 1, ownerId: 'moi', price: 2000, remaining: 5 }),
      resting({ id: 'ask-autre', seq: 2, price: 2001, remaining: 5 }),
    ]);

    expect(plan.fills).toEqual([
      { makerOrderId: 'ask-autre', makerOwnerId: 'owner-ask-autre', price: 2001, quantity: 5, amount: 10005 },
    ]);
  });

  it('ignore les ordres du même côté et les reliquats épuisés', () => {
    const plan = matchOrder({ ownerId: 'buyer', side: 'buy', type: 'market', quantity: 2 }, [
      resting({ id: 'mon-bid', seq: 1, side: 'buy', price: 2010, remaining: 5 }),
      resting({ id: 'ask-vide', seq: 2, price: 1999, remaining: 0 }),
      resting({ id: 'ask', seq: 3, price: 2002, remaining: 5 }),
    ]);

    expect(plan.fills.map((fill) => fill.makerOrderId)).toEqual(['ask']);
  });

  it('arrondit les quantités à 6 décimales et les montants au centime', () => {
    const plan = matchOrder(
      { ownerId: 'buyer', side: 'buy', type: 'market', quantity: 0.3333333 },
      [resting({ id: 'ask', seq: 1, price: 1.0834, remaining: 10 })],
    );

    expect(plan.fills[0].quantity).toBe(0.333333);
    expect(plan.fills[0].amount).toBe(0.36);
    // Le prix moyen est le VWAP des exécutions (1,0834), pas `montant /
    // quantité` : le montant est arrondi au centime (0,36 / 0,333333 = 1,08),
    // ce qui ferait afficher un prix différent de celui qui a été traité.
    expect(plan.averagePrice).toBe(1.0834);
  });

  it('un seul prix exécuté donne ce prix comme prix moyen', () => {
    const plan = matchOrder(
      { ownerId: 'buyer', side: 'buy', type: 'market', quantity: 0.25 },
      [resting({ id: 'ask', seq: 1, price: 2686.742, remaining: 5 })],
    );

    // Le montant est arrondi au centime (671,69), mais 671,69 / 0,25 = 2 686,76
    // ne doit pas remplacer le prix réellement traité.
    expect(plan.notional).toBe(671.69);
    expect(plan.averagePrice).toBe(2686.742);
    expect(plan.averagePrice.toFixed(2)).toBe('2686.74');
  });

  it('calcule un prix moyen pondéré sur plusieurs prix', () => {
    const plan = matchOrder({ ownerId: 'buyer', side: 'buy', type: 'market', quantity: 3 }, [
      resting({ id: 'a', seq: 1, price: 2000, remaining: 1 }),
      resting({ id: 'b', seq: 2, price: 2010, remaining: 2 }),
    ]);

    expect(plan.notional).toBe(6020);
    expect(plan.averagePrice).toBe(2006.6667);
  });

  it('renvoie un plan vide pour une quantité nulle', () => {
    const plan = matchOrder({ ownerId: 'buyer', side: 'buy', type: 'market', quantity: 0 }, [
      resting({ id: 'ask', seq: 1, price: 2000, remaining: 5 }),
    ]);

    expect(plan.fills).toEqual([]);
    expect(plan.averagePrice).toBe(0);
  });
});

describe('aggregateLevels / computeSpread', () => {
  const orders: RestingOrder[] = [
    resting({ id: 'a', seq: 1, side: 'sell', price: 2002, remaining: 3 }),
    resting({ id: 'b', seq: 2, side: 'sell', price: 2002, remaining: 2 }),
    resting({ id: 'c', seq: 3, side: 'sell', price: 2001, remaining: 1 }),
    resting({ id: 'd', seq: 4, side: 'buy', price: 1999, remaining: 4 }),
    resting({ id: 'e', seq: 5, side: 'buy', price: 1999, remaining: 6 }),
    resting({ id: 'f', seq: 6, side: 'buy', price: 1998, remaining: 2 }),
  ];

  it('agrège les asks par prix croissant', () => {
    expect(aggregateLevels(orders, 'sell')).toEqual([
      { price: 2001, quantity: 1, orders: 1 },
      { price: 2002, quantity: 5, orders: 2 },
    ]);
  });

  it('agrège les bids par prix décroissant', () => {
    expect(aggregateLevels(orders, 'buy')).toEqual([
      { price: 1999, quantity: 10, orders: 2 },
      { price: 1998, quantity: 2, orders: 1 },
    ]);
  });

  it('limite la profondeur demandée', () => {
    expect(aggregateLevels(orders, 'buy', 1)).toHaveLength(1);
  });

  it('calcule le spread entre les deux meilleurs prix', () => {
    expect(computeSpread(aggregateLevels(orders, 'buy'), aggregateLevels(orders, 'sell'))).toEqual({
      bestBid: 1999,
      bestAsk: 2001,
      spread: 2,
    });
  });

  it('renvoie un spread nul quand un côté est vide', () => {
    expect(computeSpread([], aggregateLevels(orders, 'sell'))).toEqual({
      bestBid: null,
      bestAsk: 2001,
      spread: null,
    });
  });
});
