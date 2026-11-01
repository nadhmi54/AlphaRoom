import { buildEquityCurve } from '../contract/equity.js';
import type {
  ParticipantData,
  PricePoint,
  ProtectionData,
  SessionData,
  SimEvent,
  TradeData,
} from '../contract/session-data.js';

/**
 * « Le mardi de la panique » : scénario fictif de 30 minutes sur XAU/USD
 * (cf. le document de cadrage). Les prix servent à illustrer, ce ne sont pas
 * des cotations historiques.
 *
 *   minutes 0-10  : 2 700 $
 *   minutes 11-21 : 2 680 $ (NEWS baissière à la minute 11)
 *   minutes 22-24 : 2 619 $ (choc de -3 % à la minute 22)
 *   minutes 25-30 : 2 640 $ (rebond partiel)
 *
 * Quatre profils pour couvrir les cas utiles aux tests :
 *   - Amine : très exposé, aucune protection, ne réagit pas ;
 *   - Sarra : prudente, stop-loss posé, réagit 2 minutes après la NEWS ;
 *   - Karim : réagit tard, une perte et un gain ;
 *   - Lina  : ne trade pas.
 */
export const INITIAL_CASH = 100_000;
export const DURATION = 30;
const SYMBOL = 'XAU/USD';

function priceFor(minute: number): number {
  if (minute <= 10) return 2700;
  if (minute <= 21) return 2680;
  if (minute <= 24) return 2619;
  return 2640;
}

export function buildPrices(): PricePoint[] {
  return Array.from({ length: DURATION + 1 }, (_, minute) => ({
    minute,
    symbol: SYMBOL,
    price: priceFor(minute),
  }));
}

export const EVENTS: SimEvent[] = [
  { id: 'ev-news', minute: 11, type: 'news', label: 'La Fed laisse entendre un durcissement de sa politique' },
  { id: 'ev-pause', minute: 15, type: 'pause', label: 'Pause pour discuter de la gestion du risque' },
  { id: 'ev-resume', minute: 16, type: 'resume', label: 'Reprise de la séance' },
  { id: 'ev-shock', minute: 22, type: 'price_shock', label: 'Choc de prix : -3 %' },
];

const trade = (
  id: string,
  minute: number,
  side: 'buy' | 'sell',
  quantity: number,
  price: number,
  expectedPrice?: number,
): TradeData => ({ id, minute, symbol: SYMBOL, side, quantity, price, ...(expectedPrice === undefined ? {} : { expectedPrice }) });

function participant(
  id: string,
  displayName: string,
  trades: TradeData[],
  protections: ProtectionData[],
  prices: PricePoint[],
): ParticipantData {
  return { id, displayName, trades, protections, equity: buildEquityCurve(INITIAL_CASH, trades, prices, DURATION) };
}

/**
 * Passage 1 : le scénario de base. Passage 2 (après un rollback à la minute 0) :
 * Amine rejoue la même séance en appliquant ce qu'il a appris — position plus
 * petite, stop-loss, réaction rapide à la NEWS. Les autres participants rejouent à l'identique.
 */
export function buildPanicTuesday(run = 1): SessionData {
  const prices = buildPrices();
  const amine =
    run === 1
      ? participant('user-amine', 'Amine B.', [trade('a1', 5, 'buy', 34, 2700, 2699)], [], prices)
      : participant(
          'user-amine',
          'Amine B.',
          [trade('a1', 5, 'buy', 12, 2700, 2700), trade('a2', 13, 'sell', 12, 2680, 2681)],
          [{ minute: 5, symbol: SYMBOL, stopLoss: 2650, takeProfit: null }],
          prices,
        );
  const participants = [
    amine,
    participant(
      'user-sarra',
      'Sarra M.',
      [trade('s1', 3, 'buy', 10, 2700, 2700), trade('s2', 13, 'sell', 10, 2680, 2681)],
      [{ minute: 3, symbol: SYMBOL, stopLoss: 2650, takeProfit: null }],
      prices,
    ),
    participant(
      'user-karim',
      'Karim T.',
      [
        trade('k1', 12, 'buy', 20, 2680, 2680),
        trade('k2', 24, 'sell', 20, 2619, 2620),
        trade('k3', 24, 'buy', 10, 2619, 2619),
        trade('k4', 27, 'sell', 10, 2640, 2640),
      ],
      [],
      prices,
    ),
    participant('user-lina', 'Lina H.', [], [], prices),
  ];
  return {
    sessionId: 'mardi-panique',
    title: 'Le mardi de la panique (démo)',
    run,
    initialCash: INITIAL_CASH,
    durationMinutes: DURATION,
    symbols: [SYMBOL],
    prices,
    events: EVENTS,
    participants,
  };
}
