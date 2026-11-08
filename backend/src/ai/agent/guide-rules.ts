import { priceAt } from '../contract/equity.js';
import { MARKET_IMPACT_EVENTS, type SessionData } from '../contract/session-data.js';
import { price, signedPct, pct } from '../analysis/format.js';
import { sanitizeLabel } from '../context/ai-context.js';
import { liveState, type LiveState } from './live-state.js';

/**
 * Le guide pédagogique : des règles simples, déterministes et testées qui
 * repèrent les moments où un trader débutant a besoin d'un coup de pouce
 * (position sans protection, news sans réaction, forte baisse…).
 *
 * Le guide ne dit JAMAIS « achète » ou « vends » : il pose le constat avec les
 * chiffres du trader, explique la notion, et propose une question à se poser.
 * Aucun modèle de langage n'intervient ici : c'est rapide, gratuit et fiable.
 */

export type GuideCode =
  | 'idle'
  | 'no_protection'
  | 'high_exposure'
  | 'concentration'
  | 'news_fresh'
  | 'news_no_reaction'
  | 'sharp_move'
  | 'drawdown'
  | 'stop_triggered'
  | 'ending';

export type GuideSeverity = 'info' | 'warn' | 'alert';

export interface GuideAlert {
  /** Stable : la même situation donne le même identifiant (pas de doublon à l'écran). */
  id: string;
  code: GuideCode;
  severity: GuideSeverity;
  minute: number;
  title: string;
  message: string;
  /** Question que le trader peut poser au coach pour approfondir. */
  question: string;
}

export const GUIDE_THRESHOLDS = {
  idleAfterMinute: 4,
  noProtectionAfterMinutes: 1,
  exposureWarn: 0.5,
  exposureAlert: 0.8,
  concentration: 0.8,
  sharpMoveWindow: 2,
  sharpMoveWarn: 0.005,
  sharpMoveAlert: 0.015,
  drawdownWarn: 0.02,
  drawdownAlert: 0.05,
  newsFreshMinutes: 5,
  newsReactionAfterMinutes: 2,
  newsReactionUntilMinutes: 10,
  endingMinutesLeft: 3,
} as const;

const money = (value: number) => `${price(Math.abs(value)).replace(/,\d+$/, '')} $`;

export function evaluateGuide(session: SessionData, participantId: string): GuideAlert[] {
  const state = liveState(session, participantId);
  const t = GUIDE_THRESHOLDS;
  const alerts: GuideAlert[] = [];
  const push = (alert: GuideAlert) => alerts.push(alert);

  // 1. Pas encore d'ordre.
  if (state.tradeCount === 0 && state.minute >= t.idleAfterMinute) {
    push({
      id: 'idle',
      code: 'idle',
      severity: 'info',
      minute: state.minute,
      title: 'Tu n’as pas encore passé d’ordre',
      message:
        `On est à la minute ${state.minute} et ton capital de ${money(session.initialCash)} est entièrement en cash. ` +
        'Rester à l’écart est un choix valable, mais observe le marché : quel est le mouvement récent ? Y a-t-il une information qui l’explique ?',
      question: 'Comment décider si je dois entrer sur le marché ?',
    });
  }

  // 2. Positions ouvertes sans stop-loss.
  for (const position of state.positions) {
    if (position.stopLoss === null && state.minute - position.openMinute >= t.noProtectionAfterMinutes) {
      push({
        id: `no_protection:${position.symbol}:${position.openMinute}`,
        code: 'no_protection',
        severity: position.weight >= 0.3 ? 'alert' : 'warn',
        minute: state.minute,
        title: `${position.symbol} : position sans stop-loss`,
        message:
          `Tu détiens ${position.quantity} ${position.symbol} (environ ${money(position.value)}, soit ${pct(position.weight)} de ton portefeuille) sans stop-loss. ` +
          'Un stop-loss ferme la position automatiquement quand le prix atteint un seuil fixé à l’avance : il limite la perte maximale d’un mauvais scénario sans te demander de réagir à temps. ' +
          'Quelle perte maximale serais-tu prêt à accepter sur cette position ?',
        question: 'À quoi sert un stop-loss et comment choisir son niveau ?',
      });
    }
  }

  // 3. Exposition élevée.
  if (state.exposure >= t.exposureWarn) {
    const level = state.exposure >= t.exposureAlert ? 'alert' : 'warn';
    push({
      id: `high_exposure:${level}`,
      code: 'high_exposure',
      severity: level,
      minute: state.minute,
      title: 'Exposition élevée',
      message:
        `${pct(state.exposure)} de ton capital est investi en positions. L’exposition mesure la part du portefeuille soumise aux variations de prix : ` +
        `plus elle est haute, plus un mouvement brusque pèse sur ta valeur, dans les deux sens. Que se passerait-il pour ton portefeuille si le prix baissait de 3 % ?`,
      question: 'Mon exposition est-elle trop élevée ?',
    });
  }

  // 4. Concentration sur un seul actif (seulement s'il y a plusieurs actifs).
  if (session.symbols.length > 1 && state.exposure >= 0.3) {
    const biggest = [...state.positions].sort((a, b) => b.value - a.value)[0];
    if (biggest && state.positionsValue > 0 && biggest.value / state.positionsValue >= t.concentration) {
      push({
        id: `concentration:${biggest.symbol}`,
        code: 'concentration',
        severity: 'warn',
        minute: state.minute,
        title: `Concentration sur ${biggest.symbol}`,
        message:
          `${pct(biggest.value / state.positionsValue)} de tes positions sont sur ${biggest.symbol}. ` +
          'Répartir sur plusieurs actifs réduit l’effet d’un mouvement défavorable sur un seul d’entre eux.',
        question: 'Qu’est-ce que la diversification ?',
      });
    }
  }

  // 5. News / chocs : on prévient dès leur arrivée, puis on relève l'absence de réaction.
  for (const event of session.events) {
    if (!MARKET_IMPACT_EVENTS.includes(event.type) || event.minute > state.minute) continue;
    const label = sanitizeLabel(event.label);
    // Une news ancienne ne se signale plus comme « fraîche » (cas d'un étudiant qui rejoint tard).
    if (state.minute - event.minute <= t.newsFreshMinutes) push({
      id: `news_fresh:${event.id}`,
      code: 'news_fresh',
      severity: 'info',
      minute: event.minute,
      title: event.type === 'news' ? 'Une news vient de tomber' : 'Le marché vient d’être bousculé',
      message:
        `Minute ${event.minute} : « ${label} ». Avant toute décision, pose-toi trois questions : cette information concerne-t-elle ton actif ? ` +
        'Est-elle plutôt favorable ou défavorable à ta position ? Le prix l’a-t-il déjà intégrée ?',
      question: 'Comment réagir à une news sans me précipiter ?',
    });

    const since = state.minute - event.minute;
    const reacted = state.lastTradeMinute !== null && state.lastTradeMinute >= event.minute;
    if (
      !reacted &&
      state.tradeCount > 0 &&
      state.positions.length > 0 &&
      since >= t.newsReactionAfterMinutes &&
      since <= t.newsReactionUntilMinutes
    ) {
      const before = priceAt(session.prices, state.positions[0]!.symbol, Math.max(0, event.minute - 1));
      const now = state.positions[0]!.price;
      const move = before && before > 0 ? (now - before) / before : null;
      push({
        id: `news_no_reaction:${event.id}`,
        code: 'news_no_reaction',
        severity: 'warn',
        minute: state.minute,
        title: 'Tu n’as pas réagi à la news',
        message:
          `La news de la minute ${event.minute} date d’il y a ${since} minute${since > 1 ? 's' : ''}` +
          (move === null ? '. ' : ` et ${state.positions[0]!.symbol} a varié de ${signedPct(move)} depuis. `) +
          'Ne rien faire est une décision possible, mais c’est mieux quand elle est choisie : ta position est-elle toujours cohérente avec ton analyse de la news ?',
        question: 'Ai-je bien réagi à la news ?',
      });
    }
  }

  // 6. Mouvement brusque du prix sur les dernières minutes.
  for (const symbol of session.symbols) {
    const now = priceAt(session.prices, symbol, state.minute);
    const before = priceAt(session.prices, symbol, Math.max(0, state.minute - t.sharpMoveWindow));
    if (now === undefined || before === undefined || before <= 0) continue;
    const move = (now - before) / before;
    if (Math.abs(move) < t.sharpMoveWarn) continue;
    const held = state.positions.find((p) => p.symbol === symbol);
    const effect = held
      ? ` Sur tes ${held.quantity} ${symbol}, cela représente environ ${money((now - before) * held.quantity)} ${move < 0 ? 'de perte' : 'de gain'} sur la période.`
      : ' Tu n’as pas de position sur cet actif pour l’instant.';
    push({
      id: `sharp_move:${symbol}:${state.minute}`,
      code: 'sharp_move',
      severity: Math.abs(move) >= t.sharpMoveAlert ? 'alert' : 'warn',
      minute: state.minute,
      title: `${symbol} ${move < 0 ? 'chute' : 'bondit'}`,
      message:
        `${symbol} a varié de ${signedPct(move)} en ${t.sharpMoveWindow} minutes (de ${price(before)} à ${price(now)}).${effect} ` +
        'Dans un mouvement rapide, évite de décider sous le coup de l’émotion : que dit ton plan de départ ?',
      question: 'Que faire face à un mouvement brusque du marché ?',
    });
  }

  // 7. Baisse depuis le sommet du portefeuille.
  if (state.drawdown <= -t.drawdownWarn) {
    const level = state.drawdown <= -t.drawdownAlert ? 'alert' : 'warn';
    push({
      id: `drawdown:${level}`,
      code: 'drawdown',
      severity: level,
      minute: state.minute,
      title: 'Ton portefeuille a reculé',
      message:
        `Ton portefeuille est ${pct(state.drawdown)} sous son plus haut (valeur actuelle ${money(state.total)}). ` +
        'Une baisse n’est pas une faute en soi, mais c’est le moment de vérifier que ta perte reste dans ce que tu avais prévu d’accepter.',
      question: 'Comment limiter mes pertes ?',
    });
  }

  // 8. Stop-loss déclenché récemment.
  const stopped = recentlyStopped(session, participantId, state);
  if (stopped) {
    push({
      id: `stop_triggered:${stopped.symbol}:${stopped.minute}`,
      code: 'stop_triggered',
      severity: 'info',
      minute: stopped.minute,
      title: 'Ton stop-loss a joué son rôle',
      message:
        `Ta position sur ${stopped.symbol} a été fermée à la minute ${stopped.minute} (autour de ${price(stopped.price)}), au niveau de ton stop-loss. ` +
        'C’est exactement son rôle : limiter la perte. Maintenant, ré-entrer ou attendre ? Qu’est-ce qui a changé depuis ton entrée ?',
      question: 'Que faire après un stop-loss déclenché ?',
    });
  }

  // 9. Fin de séance proche.
  if (session.durationMinutes - state.minute <= t.endingMinutesLeft && state.minute > 0) {
    push({
      id: 'ending',
      code: 'ending',
      severity: 'info',
      minute: state.minute,
      title: 'La séance se termine bientôt',
      message: 'Il reste très peu de temps. Garde un œil sur tes positions ouvertes, puis demande ton bilan personnel au coach.',
      question: 'Fais le bilan de ma séance.',
    });
  }

  return alerts;
}

/** Position fermée dans les 2 dernières minutes au niveau de son stop-loss. */
function recentlyStopped(session: SessionData, participantId: string, state: LiveState) {
  const participant = session.participants.find((p) => p.id === participantId);
  if (!participant) return null;
  const sells = participant.trades
    .filter((t) => t.side === 'sell' && t.minute <= state.minute && t.minute >= state.minute - 2)
    .sort((a, b) => b.minute - a.minute);
  for (const sell of sells) {
    if (state.positions.some((p) => p.symbol === sell.symbol)) continue;
    const stops = participant.protections
      .filter((p) => p.symbol === sell.symbol && p.stopLoss !== null && p.minute <= sell.minute)
      .sort((a, b) => b.minute - a.minute);
    const stop = stops[0]?.stopLoss;
    if (stop !== undefined && stop !== null && sell.price <= stop * 1.002) {
      return { symbol: sell.symbol, minute: sell.minute, price: sell.price };
    }
  }
  return null;
}
