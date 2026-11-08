import { priceAt, round } from '../contract/equity.js';
import { MARKET_IMPACT_EVENTS, type SessionData } from '../contract/session-data.js';
import { sanitizeLabel } from '../context/ai-context.js';
import type { ToolSpec } from '../llm/llm-provider.js';
import type { Evidence } from '../metrics/metrics.js';
import { canonicalEngineSymbol } from '../../portefeuille/market-data/market-feed-config.js';
import { evaluateGuide } from './guide-rules.js';
import type { MarketToolsPort, PositionContext } from '../market/market-analysis.service.js';
import { currentMinute, liveState, roundPrice, type OpenPosition } from './live-state.js';

/**
 * Outils que l'agent peut appeler. Garanties :
 *   - LECTURE SEULE : aucun outil n'écrit, ne passe d'ordre ni ne modifie la simulation ;
 *   - LIMITÉS À LA PERSONNE : l'identifiant du participant est fixé par le serveur,
 *     le modèle ne peut pas le choisir (il ne peut donc pas lire les autres) ;
 *   - AUCUN FUTUR : seules les données jusqu'à la minute actuelle sont renvoyées ;
 *   - les taux sont renvoyés en pourcentages déjà calculés (clés `*_pct`), le modèle
 *     n'a aucun calcul à faire.
 */

export interface ToolOutput {
  data: Record<string, unknown>;
  evidence: Evidence[];
}

export interface AgentToolbox {
  specs: ToolSpec[];
  /** Outils instantanés (portefeuille, simulations…). */
  run(name: string, rawArguments: string): ToolOutput;
  /** Tous les outils, y compris ceux qui interrogent le marché (réseau) : c'est ce que l'agent appelle. */
  runAsync(name: string, rawArguments: string): Promise<ToolOutput>;
}

export interface ToolboxInput {
  session: SessionData;
  participantId: string;
  /** Résumé de la mémoire de séance (alertes déjà montrées, questions déjà posées). */
  memory: () => Record<string, unknown>;
  /** Analyse des marchés réels (historique Binance/Yahoo). Absent : les outils de marché ne sont pas proposés. */
  market?: MarketToolsPort;
}

const obj = (properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: 'get_session_info',
    description: 'Infos générales : nom de la séance, minute actuelle, durée, minutes restantes, actifs, capital de départ.',
    parameters: obj(),
  },
  {
    name: 'get_portfolio',
    description:
      'Portefeuille actuel du trader : cash, valeur des positions, gain/perte, rendement, exposition (part investie), baisse actuelle, positions ouvertes avec stop-loss / take-profit.',
    parameters: obj(),
  },
  {
    name: 'get_trades',
    description: 'Derniers ordres exécutés par le trader (minute, actif, achat/vente, quantité, prix).',
    parameters: obj({ limit: { type: 'integer', description: 'Nombre d’ordres, 1 à 30 (10 par défaut).' } }),
  },
  {
    name: 'get_market',
    description: 'Marché : prix actuel, variation depuis le départ, plus haut / plus bas, et derniers prix minute par minute.',
    parameters: obj({
      symbol: { type: 'string', description: 'Actif (ex. XAU/USD). Absent : tous les actifs.' },
      minutes: { type: 'integer', description: 'Nombre de dernières minutes à renvoyer, 1 à 30 (6 par défaut).' },
    }),
  },
  {
    name: 'get_events',
    description:
      'News et chocs déjà survenus : minute, titre, prix avant/après, variation, et si le trader a réagi (et au bout de combien de minutes).',
    parameters: obj(),
  },
  {
    name: 'get_risk_review',
    description: 'Points de vigilance détectés en ce moment pour ce trader (protection, exposition, mouvement brusque, réaction aux news…).',
    parameters: obj(),
  },
  {
    name: 'simulate_price_move',
    description:
      'SIMULATION « et si ? » : effet d’un mouvement de prix sur le portefeuille actuel du trader (gain/perte, nouvelle valeur, nouvelle exposition). Donne soit change_pct (variation en %, ex. -3), soit target_price (prix cible).',
    parameters: obj({
      change_pct: { type: 'number', description: 'Variation du prix en %, négative pour une baisse (ex. -3).' },
      target_price: { type: 'number', description: 'Prix cible de l’actif.' },
      symbol: { type: 'string', description: 'Actif (par défaut : la plus grosse position).' },
    }),
  },
  {
    name: 'simulate_stop_loss',
    description:
      'SIMULATION : ce que coûterait un stop-loss à un niveau donné sur la position actuelle (distance au prix, perte si déclenché, part du portefeuille).',
    parameters: obj(
      {
        stop_price: { type: 'number', description: 'Niveau du stop-loss.' },
        symbol: { type: 'string', description: 'Actif (par défaut : la plus grosse position).' },
      },
      ['stop_price'],
    ),
  },
  {
    name: 'position_size',
    description:
      'SIMULATION : quelle quantité acheter pour ne pas risquer plus d’un certain % du portefeuille, avec un stop-loss donné, au prix actuel.',
    parameters: obj(
      {
        risk_pct: { type: 'number', description: 'Part du portefeuille qu’on accepte de perdre, en % (ex. 1).' },
        stop_price: { type: 'number', description: 'Niveau du stop-loss prévu.' },
        symbol: { type: 'string', description: 'Actif (par défaut : le premier actif de la séance).' },
      },
      ['risk_pct', 'stop_price'],
    ),
  },
  {
    name: 'get_memory',
    description: 'Ce que le coach a déjà signalé ou répondu à ce trader pendant la séance (pour ne pas se répéter, et relever les erreurs qui reviennent).',
    parameters: obj(),
  },
];

export const MARKET_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'scan_markets',
    description:
      'ANALYSE DES MARCHÉS RÉELS (historique réel Binance/Yahoo, indépendant de la séance simulée) : classe les actifs des 4 marchés (crypto, actions, matières premières, devises) et compare les marchés entre eux sur une période. Sert à répondre à « quel marché / quel actif a le mieux performé ? ». Renvoie rendement, volatilité, ratio rendement/risque, baisse maximale, RSI, tendance. Ce sont des faits passés, pas des prévisions.',
    parameters: obj({
      marche: { type: 'string', enum: ['all', 'crypto', 'stock', 'commodity', 'forex'], description: 'Marché à classer (all par défaut).' },
      horizon: { type: 'string', enum: ['semaine', 'mois', 'trimestre'], description: 'Période observée (mois par défaut).' },
      critere: { type: 'string', enum: ['ajuste_au_risque', 'rendement'], description: 'ajuste_au_risque (par défaut, plus juste) ou rendement brut.' },
      limite: { type: 'integer', description: 'Nombre d’actifs dans le haut du classement, 1 à 12 (8 par défaut).' },
    }),
  },
  {
    name: 'analyze_asset',
    description:
      'LECTURE D’UN ACTIF sur données réelles : tendance, moyennes mobiles, RSI, support/résistance, biais (haussier/baissier/neutre) avec ses raisons, et niveaux pédagogiques (stop-loss, objectif) calculés avec la volatilité réelle. Sert à répondre à « quand acheter / vendre ? » avec des conditions chiffrées. Ce n’est pas une prévision.',
    parameters: obj(
      {
        symbol: { type: 'string', description: 'Symbole de la plateforme (ex. XAU/USD, EUR/USD, BTC/USDT, AAPL, WTI/USD).' },
        horizon: { type: 'string', enum: ['semaine', 'mois', 'trimestre'], description: 'Période observée (mois par défaut).' },
      },
      ['symbol'],
    ),
  },
  {
    name: 'simulate_outcomes',
    description:
      'MONTE CARLO sur la volatilité réelle de l’actif (5 000 trajectoires, aucune direction supposée) : probabilité de perdre au moins X %, de gagner au moins X %, scénario pessimiste (5 % pires cas), médian et optimiste, et — si stop_pct est donné — la probabilité que le stop-loss soit touché avant la fin. Si le trader détient l’actif, chiffre aussi la perte en montant. Sert à « quel est mon risque ? », « mon stop va-t-il sauter ? ». Probabilités, pas prévisions.',
    parameters: obj(
      {
        symbol: { type: 'string', description: 'Symbole de la plateforme (ex. XAU/USD, BTC/USDT, AAPL).' },
        jours: { type: 'integer', description: 'Horizon en jours de cotation, 1 à 60 (5 par défaut).' },
        stop_pct: { type: 'number', description: 'Distance du stop-loss sous le prix, en % (ex. 3 pour un stop à 3 % sous le prix).' },
      },
      ['symbol'],
    ),
  },
  {
    name: 'backtest_signal',
    description:
      'BACKTEST de la lecture « règles simples » (tendance, élan, cassure) sur l’historique réel de l’actif : à chaque jour passé, que s’est-il passé les N jours suivants quand le signal était haussier / baissier / neutre ? Renvoie taux de réussite, rendement moyen, pire cas et avantage par rapport à la moyenne. Sert à « ce signal est-il fiable ? ». Échantillon court : à présenter avec prudence.',
    parameters: obj(
      {
        symbol: { type: 'string', description: 'Symbole de la plateforme (ex. XAU/USD, BTC/USDT, AAPL).' },
        jours_apres: { type: 'integer', description: 'Nombre de jours observés après chaque signal, 1 à 20 (5 par défaut).' },
      },
      ['symbol'],
    ),
  },
];

const pctOf = (fraction: number) => round(fraction * 100, 2);

export function buildToolbox(input: ToolboxInput): AgentToolbox {
  const { session, participantId } = input;
  const now = currentMinute(session);
  const participant = session.participants.find((p) => p.id === participantId);

  const handlers: Record<string, (args: Record<string, unknown>) => ToolOutput> = {
    get_session_info: () => ({
      data: {
        nom: session.title ?? session.sessionId,
        minute_actuelle: now,
        duree_minutes: session.durationMinutes,
        minutes_restantes: Math.max(0, session.durationMinutes - now),
        actifs: session.symbols,
        capital_initial: session.initialCash,
      },
      evidence: [{ type: 'minute', value: now }],
    }),

    get_portfolio: () => {
      const state = liveState(session, participantId);
      const m = state.metrics;
      return {
        data: {
          minute: state.minute,
          cash: state.cash,
          valeur_positions: state.positionsValue,
          valeur_totale: state.total,
          gain_perte: state.pnl,
          rendement_pct: pctOf(state.returnRate),
          exposition_pct: pctOf(state.exposure),
          exposition_max_pct: pctOf(m.maxExposure.value),
          concentration_max_pct: m.concentration.value === null ? null : pctOf(m.concentration.value),
          positions_protegees_par_stop_loss_pct: m.stopLossRatio.value === null ? null : pctOf(m.stopLossRatio.value),
          baisse_depuis_sommet_pct: pctOf(Math.abs(state.drawdown)),
          baisse_max_pct: pctOf(Math.abs(m.maxDrawdown.value)),
          ordres_passes: state.tradeCount,
          positions_fermees: m.closedPositions,
          positions_ouvertes: state.positions.map((p) => ({
            actif: p.symbol,
            quantite: p.quantity,
            prix_moyen: p.averageCost,
            prix_actuel: p.price,
            valeur: p.value,
            gain_perte_latent: p.unrealizedPnl,
            poids_pct: pctOf(p.weight),
            stop_loss: p.stopLoss,
            take_profit: p.takeProfit,
            protegee: p.stopLoss !== null,
            // Chiffres déjà calculés pour que le coach n'ait jamais à les faire de tête.
            distance_stop_pct: p.stopLoss === null || !p.price ? null : pctOf(Math.abs(p.price - p.stopLoss) / p.price),
            gain_perte_si_stop: p.stopLoss === null ? null : round((p.stopLoss - p.averageCost) * p.quantity, 2),
            gain_perte_si_stop_capital_pct: p.stopLoss === null || !state.total ? null : pctOf(((p.stopLoss - p.averageCost) * p.quantity) / state.total),
          })),
        },
        evidence: [{ type: 'minute', value: state.minute }],
      };
    },

    get_trades: (args) => {
      const limit = clampInt(args.limit, 1, 30, 10);
      const trades = [...(participant?.trades ?? [])]
        .filter((t) => t.minute <= now)
        .sort((a, b) => a.minute - b.minute)
        .slice(-limit);
      return {
        data: {
          ordres: trades.map((t) => ({
            id: t.id,
            minute: t.minute,
            actif: t.symbol,
            sens: t.side === 'buy' ? 'achat' : 'vente',
            quantite: t.quantity,
            prix: t.price,
          })),
        },
        evidence: trades.map((t) => ({ type: 'trade', id: t.id }) as Evidence),
      };
    },

    get_market: (args) => {
      const wanted = typeof args.symbol === 'string' ? args.symbol : undefined;
      const symbols = wanted ? session.symbols.filter((s) => s === wanted) : session.symbols;
      if (symbols.length === 0) return { data: { erreur: 'Actif inconnu.', actifs_disponibles: session.symbols }, evidence: [] };
      const last = clampInt(args.minutes, 1, 30, 6);
      return {
        data: {
          marches: symbols.map((symbol) => {
            const points = session.prices.filter((p) => p.symbol === symbol && p.minute <= now).sort((a, b) => a.minute - b.minute);
            const first = points[0];
            const latest = points.at(-1);
            const high = points.reduce((a, b) => (b.price > a.price ? b : a), points[0]!);
            const low = points.reduce((a, b) => (b.price < a.price ? b : a), points[0]!);
            const previous = points.at(-2);
            return {
              actif: symbol,
              prix_actuel: latest?.price ?? null,
              prix_depart: first?.price ?? null,
              variation_depuis_depart_pct: first && latest && first.price > 0 ? pctOf((latest.price - first.price) / first.price) : null,
              variation_derniere_minute_pct: previous && latest && previous.price > 0 ? pctOf((latest.price - previous.price) / previous.price) : null,
              plus_haut: high?.price ?? null,
              minute_plus_haut: high?.minute ?? null,
              plus_bas: low?.price ?? null,
              minute_plus_bas: low?.minute ?? null,
              derniers_prix: points.slice(-last).map((p) => ({ minute: p.minute, prix: p.price })),
            };
          }),
        },
        evidence: [{ type: 'minute', value: now }],
      };
    },

    get_events: () => {
      const trades = [...(participant?.trades ?? [])].sort((a, b) => a.minute - b.minute);
      const events = session.events.filter((e) => e.minute <= now).sort((a, b) => a.minute - b.minute);
      return {
        data: {
          evenements: events.map((event) => {
            const symbol = session.symbols[0];
            const before = symbol ? priceAt(session.prices, symbol, Math.max(0, event.minute - 1)) : undefined;
            const after = symbol ? priceAt(session.prices, symbol, Math.min(now, event.minute + 5)) : undefined;
            const next = trades.find((t) => t.minute >= event.minute && t.minute - event.minute <= 10);
            const impact = MARKET_IMPACT_EVENTS.includes(event.type);
            return {
              id: event.id,
              minute: event.minute,
              type: event.type,
              titre: sanitizeLabel(event.label),
              ...(before !== undefined && after !== undefined && before > 0
                ? { prix_avant: before, prix_apres: after, variation_pct: pctOf((after - before) / before) }
                : {}),
              ...(impact ? { trader_a_reagi: next !== undefined, delai_reaction_minutes: next ? next.minute - event.minute : null } : {}),
            };
          }),
        },
        evidence: events.map((e) => ({ type: 'event', id: e.id }) as Evidence),
      };
    },

    get_risk_review: () => {
      const alerts = evaluateGuide(session, participantId);
      return {
        data: { points_de_vigilance: alerts.map((a) => ({ code: a.code, gravite: a.severity, minute: a.minute, constat: a.message })) },
        evidence: [{ type: 'minute', value: now }],
      };
    },

    simulate_price_move: (args) => {
      const state = liveState(session, participantId);
      const held = pickPosition(state.positions, args.symbol);
      if (!held) return { data: { erreur: 'Aucune position ouverte : rien à simuler. Utilise position_size pour dimensionner un achat.' }, evidence: [] };
      const change = num(args.change_pct);
      const target = num(args.target_price);
      let newPrice: number | null = null;
      if (target !== null && target > 0) newPrice = target;
      else if (change !== null && change > -100) newPrice = held.price * (1 + change / 100);
      if (newPrice === null) return { data: { erreur: 'Donne change_pct (ex. -3) ou target_price.' }, evidence: [] };
      const delta = (newPrice - held.price) * held.quantity;
      const newPositionsValue = state.positionsValue + delta;
      const newTotal = state.cash + newPositionsValue;
      const stopHit = held.stopLoss !== null && newPrice <= held.stopLoss;
      return {
        data: {
          actif: held.symbol,
          prix_actuel: held.price,
          prix_simule: roundPrice(newPrice),
          variation_prix_pct: pctOf((newPrice - held.price) / held.price),
          sens: newPrice >= held.price ? 'hausse' : 'baisse',
          quantite_detenue: held.quantity,
          gain_perte_simule: round(delta, 2),
          valeur_totale_actuelle: state.total,
          valeur_totale_simulee: round(newTotal, 2),
          rendement_simule_pct: pctOf((newTotal - session.initialCash) / session.initialCash),
          exposition_simulee_pct: newTotal > 0 ? pctOf(newPositionsValue / newTotal) : 0,
          stop_loss_actuel: held.stopLoss,
          stop_loss_declenche: stopHit,
        },
        evidence: [{ type: 'minute', value: state.minute }],
      };
    },

    simulate_stop_loss: (args) => {
      const state = liveState(session, participantId);
      const held = pickPosition(state.positions, args.symbol);
      const stop = num(args.stop_price);
      if (!held) return { data: { erreur: 'Aucune position ouverte à protéger.' }, evidence: [] };
      if (stop === null || stop <= 0) return { data: { erreur: 'stop_price invalide.' }, evidence: [] };
      if (stop >= held.price) {
        return { data: { erreur: 'Un stop-loss sur une position acheteuse doit être sous le prix actuel.', prix_actuel: held.price }, evidence: [] };
      }
      const lossVsEntry = (stop - held.averageCost) * held.quantity;
      const lossVsNow = (stop - held.price) * held.quantity;
      return {
        data: {
          actif: held.symbol,
          prix_actuel: held.price,
          prix_moyen_entree: held.averageCost,
          stop_propose: stop,
          distance_au_prix_pct: pctOf((held.price - stop) / held.price),
          quantite: held.quantity,
          resultat_si_declenche_vs_entree: round(lossVsEntry, 2),
          perte_depuis_maintenant_si_declenche: round(lossVsNow, 2),
          part_du_portefeuille_perdue_depuis_maintenant_pct: state.total > 0 ? pctOf(Math.abs(lossVsNow) / state.total) : 0,
          stop_actuel: held.stopLoss,
        },
        evidence: [{ type: 'minute', value: state.minute }],
      };
    },

    position_size: (args) => {
      const state = liveState(session, participantId);
      const symbol = typeof args.symbol === 'string' && session.symbols.includes(args.symbol) ? args.symbol : session.symbols[0];
      const price = symbol ? priceAt(session.prices, symbol, now) : undefined;
      const riskPct = num(args.risk_pct);
      const stop = num(args.stop_price);
      if (!symbol || price === undefined) return { data: { erreur: 'Prix indisponible.' }, evidence: [] };
      if (riskPct === null || riskPct <= 0 || riskPct > 100) return { data: { erreur: 'risk_pct doit être entre 0 et 100.' }, evidence: [] };
      if (stop === null || stop <= 0 || stop >= price) {
        return { data: { erreur: 'Le stop-loss doit être sous le prix actuel.', prix_actuel: price }, evidence: [] };
      }
      const riskCash = (state.total * riskPct) / 100;
      const perUnit = price - stop;
      const ideal = riskCash / perUnit;
      const affordable = state.cash / price;
      const quantity = Math.min(ideal, affordable);
      return {
        data: {
          actif: symbol,
          prix_actuel: price,
          stop_prevu: stop,
          risque_accepte_pct: round(riskPct, 2),
          risque_accepte_montant: round(riskCash, 2),
          perte_par_unite_si_stop: roundPrice(perUnit),
          quantite_theorique: round(ideal, 4),
          quantite_maximale_avec_le_cash: round(affordable, 4),
          quantite_recommandee_par_la_regle: round(quantity, 4),
          cout_de_la_position: round(quantity * price, 2),
          cout_en_pct_du_portefeuille_pct: state.total > 0 ? pctOf((quantity * price) / state.total) : 0,
          limite_par_le_cash: ideal > affordable,
        },
        evidence: [{ type: 'minute', value: state.minute }],
      };
    },

    get_memory: () => ({ data: input.memory(), evidence: [] }),
  };

  /** Position réelle du trader sur l'actif demandé (la plateforme n'a qu'un seul portefeuille par séance). */
  const positionFor = (symbol: unknown): PositionContext | undefined => {
    if (typeof symbol !== 'string') return undefined;
    const wanted = canonicalEngineSymbol(symbol);
    const state = liveState(session, participantId);
    const held = state.positions.find((p) => canonicalEngineSymbol(p.symbol) === wanted);
    return held ? { value: held.value, portfolioTotal: state.total } : undefined;
  };

  const marketHandlers: Record<string, (args: Record<string, unknown>) => Promise<Record<string, unknown>>> = input.market
    ? {
        scan_markets: (args) => input.market!.scan(args),
        analyze_asset: (args) => input.market!.analyze(args),
        // Le modèle ne choisit que l'actif, l'horizon et le stop : la position vient du serveur.
        simulate_outcomes: (args) =>
          input.market!.simulate(
            { symbol: args.symbol, jours: args.jours, stop_pct: args.stop_pct },
            positionFor(args.symbol),
          ),
        backtest_signal: (args) => input.market!.backtest({ symbol: args.symbol, jours_apres: args.jours_apres }),
      }
    : {};

  const parseArgs = (rawArguments: string): Record<string, unknown> | null => {
    try {
      const parsed: unknown = rawArguments.trim() === '' ? {} : JSON.parse(rawArguments);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return null;
    }
  };
  const unreadable: ToolOutput = { data: { erreur: 'Arguments illisibles (JSON attendu).' }, evidence: [] };

  const run = (name: string, rawArguments: string): ToolOutput => {
    const handler = handlers[name];
    if (!handler) return { data: { erreur: `Outil inconnu : ${name}.` }, evidence: [] };
    const args = parseArgs(rawArguments);
    if (!args) return unreadable;
    try {
      return handler(args);
    } catch {
      return { data: { erreur: 'Données indisponibles pour cet outil.' }, evidence: [] };
    }
  };

  return {
    specs: input.market ? [...TOOL_SPECS, ...MARKET_TOOL_SPECS] : TOOL_SPECS,
    run,
    async runAsync(name, rawArguments) {
      const handler = marketHandlers[name];
      if (!handler) return run(name, rawArguments);
      const args = parseArgs(rawArguments);
      if (!args) return unreadable;
      try {
        return { data: await handler(args), evidence: [] };
      } catch {
        return { data: { erreur: 'Analyse de marché indisponible pour le moment.' }, evidence: [] };
      }
    },
  };
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Position visée : celle de l'actif demandé, sinon la plus grosse. */
function pickPosition(positions: OpenPosition[], symbol: unknown): OpenPosition | undefined {
  if (typeof symbol === 'string') {
    const found = positions.find((p) => p.symbol === symbol);
    if (found) return found;
  }
  return [...positions].sort((a, b) => b.value - a.value)[0];
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
