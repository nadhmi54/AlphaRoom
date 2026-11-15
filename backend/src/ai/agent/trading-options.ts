import { priceAt, round } from '../contract/equity.js';
import type { SessionData } from '../contract/session-data.js';
import { evaluateGuide, GUIDE_THRESHOLDS, type GuideAlert } from './guide-rules.js';
import { liveState, roundPrice, type LiveState, type OpenPosition } from './live-state.js';

/**
 * « Que puis-je faire maintenant ? » : pour chaque actif, ce que l'étudiant a le
 * droit de faire (acheter, vendre) et les options raisonnables, chacune avec sa
 * justification, son risque et ce qui ferait changer d'avis.
 *
 * Tout est calculé ici, en code déterministe et en lecture seule :
 *   - le coach ne passe JAMAIS d'ordre : il propose, l'étudiant décide et clique ;
 *   - les règles de la salle sont celles du moteur (achat limité par le cash,
 *     vente limitée à la quantité détenue, pas de vente à découvert) ;
 *   - les textes ne contiennent aucun chiffre : les chiffres sont dans des champs
 *     numériques à part, que le contrôle des réponses sait vérifier.
 */

export type OptionAction = 'acheter' | 'acheter_une_partie' | 'attendre' | 'garder' | 'poser_un_stop' | 'alleger' | 'cloturer';

export interface TradingOption {
  action: OptionAction;
  /** Pourquoi cette option se défend (déduit des données du trader, sans chiffre dans le texte). */
  pourquoi: string[];
  /** Ce qui peut mal tourner. */
  risques: string[];
  /** Ce qui devrait faire changer d'avis. */
  ce_qui_ferait_changer_d_avis: string;
  /** Chiffres utiles pour appuyer l'option (déjà calculés). */
  chiffres: Record<string, number | null>;
}

export interface AssetOptions {
  actif: string;
  prix_actuel: number | null;
  variation_5_min_pct: number | null;
  peut_acheter: boolean;
  /** Pourquoi l'achat est impossible, le cas échéant. */
  achat_impossible_car?: string;
  quantite_max_achat: number;
  peut_vendre: boolean;
  vente_impossible_car?: string;
  quantite_detenue: number;
  position: {
    valeur: number;
    gain_perte_latent: number;
    poids_pct: number;
    protegee: boolean;
    stop_loss: number | null;
    take_profit: number | null;
  } | null;
  options: TradingOption[];
}

export interface TradingOptions {
  minute: number;
  minutes_restantes: number;
  cash: number;
  valeur_totale: number;
  exposition_pct: number;
  regles_de_la_salle: string;
  actifs: AssetOptions[];
  points_de_vigilance: Array<{ code: string; gravite: string; constat: string }>;
  rappel: string;
}

const pct = (fraction: number) => round(fraction * 100, 2);

export const TRADING_RULES =
  'Achat possible dans la limite du cash disponible ; vente possible uniquement d’une position détenue (pas de vente à découvert) ; ' +
  'c’est l’étudiant qui passe ses ordres depuis le panneau d’ordres, le coach n’en passe jamais.';

export const TRADING_REMINDER =
  'Ces options sont des pistes avec leurs raisons, pas des ordres : l’étudiant décide, et c’est lui qui clique. Attendre est aussi une décision valable.';

/** Quantité maximale achetable au prix actuel avec le cash disponible (arrondi vers le bas, 4 décimales). */
function maxBuy(cash: number, price: number | null): number {
  if (price === null || price <= 0 || cash <= 0) return 0;
  return Math.floor((cash / price) * 10_000) / 10_000;
}

function recentMove(session: SessionData, symbol: string, minute: number): number | null {
  const now = priceAt(session.prices, symbol, minute);
  const before = priceAt(session.prices, symbol, Math.max(0, minute - 5));
  if (now === undefined || before === undefined || before <= 0) return null;
  return pct((now - before) / before);
}

function optionsForAsset(
  session: SessionData,
  state: LiveState,
  alerts: GuideAlert[],
  symbol: string,
  held: OpenPosition | undefined,
  price: number | null,
  move: number | null,
): TradingOption[] {
  const options: TradingOption[] = [];
  const minutesLeft = Math.max(0, session.durationMinutes - state.minute);
  const endingSoon = minutesLeft <= GUIDE_THRESHOLDS.endingMinutesLeft;
  const canBuy = maxBuy(state.cash, price) > 0 && !endingSoon;
  const highExposure = state.exposure >= GUIDE_THRESHOLDS.exposureWarn;
  const freshNews = alerts.some((a) => a.code === 'news_fresh');
  const sharp = alerts.find((a) => a.code === 'sharp_move' && a.title.startsWith(symbol));
  const down = move !== null && move < 0;

  if (!held) {
    if (canBuy) {
      options.push({
        action: 'acheter_une_partie',
        pourquoi: [
          'Tu n’as aucune position sur cet actif : entrer par petites quantités te laisse de la marge pour te tromper et corriger.',
          highExposure ? 'Ton portefeuille est déjà bien investi : une partie seulement évite de tout miser sur une idée.' : 'Il te reste beaucoup de cash : tu peux te permettre une entrée mesurée.',
          'Pose un stop-loss dès l’entrée pour fixer à l’avance la perte maximale que tu acceptes.',
        ],
        risques: [
          'Le prix peut aller contre toi juste après l’entrée.',
          freshNews ? 'Une news vient de tomber : le prix peut encore bouger fortement dans les minutes qui suivent.' : 'Entrer sans scénario clair revient à parier.',
          ...(sharp ? ['Le prix bouge vite en ce moment : entrer sous le coup de l’émotion est un piège classique.'] : []),
        ],
        ce_qui_ferait_changer_d_avis:
          'Si tu ne sais pas expliquer en une phrase pourquoi tu entres, ou si tu ne peux pas fixer ton stop-loss à un niveau que tu acceptes, attends.',
        chiffres: {
          quantite_max_avec_le_cash: maxBuy(state.cash, price),
          cash_disponible: state.cash,
          variation_5_min_pct: move,
          exposition_actuelle_pct: pct(state.exposure),
        },
      });
    }
    options.push({
      action: 'attendre',
      pourquoi: [
        'Ne rien faire est une décision valable quand le scénario n’est pas clair.',
        ...(freshNews ? ['Une news vient de tomber : laisse le prix digérer l’information avant d’entrer.'] : []),
        ...(sharp ? ['Le mouvement est rapide : mieux vaut observer que courir après le prix.'] : []),
        ...(endingSoon ? ['La séance se termine : peu de temps pour qu’une idée se réalise.'] : []),
      ],
      risques: ['Tu peux manquer un mouvement favorable : c’est le prix à payer pour ne pas entrer à contretemps.'],
      ce_qui_ferait_changer_d_avis: 'Un scénario clair (une raison d’entrer, un niveau de stop-loss, une taille de position) fait passer à l’achat.',
      chiffres: { variation_5_min_pct: move, minutes_restantes: minutesLeft },
    });
    return options;
  }

  const weightPct = pct(held.weight);
  const gainNow = held.unrealizedPnl;
  const unprotected = held.stopLoss === null;

  if (unprotected) {
    options.push({
      action: 'poser_un_stop',
      pourquoi: [
        'Ta position n’a aucun stop-loss : la perte n’est pas limitée si le prix chute.',
        'Un stop ferme la position automatiquement à un niveau choisi à l’avance, sans que tu aies à réagir à temps.',
      ],
      risques: ['Un stop trop proche peut être déclenché par un simple mouvement normal du prix ; trop loin, il ne protège presque rien.'],
      ce_qui_ferait_changer_d_avis: 'Si tu es prêt à surveiller activement et à sortir toi-même, le stop est moins indispensable, mais il reste une sécurité.',
      chiffres: { prix_actuel: price, perte_latente_ou_gain: gainNow, poids_portefeuille_pct: weightPct },
    });
  }

  options.push({
    action: 'garder',
    pourquoi: [
      gainNow >= 0 ? 'La position est dans le vert : tu peux la laisser vivre si ton scénario de départ tient toujours.' : 'La position est dans le rouge : sortir uniquement pour “arrêter de souffrir” n’est pas une raison ; garde-la seulement si ton scénario de départ tient toujours.',
      unprotected ? 'À condition de lui poser un stop-loss.' : 'Elle est protégée par un stop-loss : la perte maximale est déjà fixée.',
    ],
    risques: [
      down ? 'Le prix recule en ce moment : vérifie que ta perte reste dans ce que tu avais prévu d’accepter.' : gainNow > 0 ? 'Un retournement du marché peut effacer le gain latent.' : 'Si le prix continue de reculer, la perte s’aggrave : c’est pour cela que le niveau d’invalidation compte.',
      ...(freshNews ? ['Une news récente peut changer le scénario.'] : []),
    ],
    ce_qui_ferait_changer_d_avis: 'Si le prix touche ton niveau d’invalidation, ou si une information contredit ton scénario, alors il faut sortir plutôt que d’espérer.',
    chiffres: { gain_perte_latent: gainNow, poids_portefeuille_pct: weightPct, variation_5_min_pct: move },
  });

  if (highExposure || held.weight >= GUIDE_THRESHOLDS.concentration || weightPct >= 30) {
    options.push({
      action: 'alleger',
      pourquoi: [
        'Ton portefeuille est fortement exposé : vendre une partie réduit l’effet d’un mouvement brusque sur ta valeur.',
        gainNow > 0 ? 'Tu sécurises une partie du gain déjà acquis tout en gardant une position.' : 'Tu réduis le risque sans fermer entièrement la position.',
      ],
      risques: ['Si le prix continue dans ton sens, tu gagnes moins que si tu avais tout gardé.'],
      ce_qui_ferait_changer_d_avis: 'Si ta position est petite par rapport à ton capital et bien protégée, alléger n’est pas nécessaire.',
      chiffres: { exposition_actuelle_pct: pct(state.exposure), poids_portefeuille_pct: weightPct, quantite_detenue: held.quantity },
    });
  }

  options.push({
    action: 'cloturer',
    pourquoi: [
      endingSoon ? 'La séance se termine : fermer la position fixe le résultat et évite une mauvaise surprise de dernière minute.' : 'Fermer la position fixe ton résultat et met fin au risque sur cet actif.',
      ...(sharp && down ? ['Le prix baisse vite : sortir peut protéger ton capital si ton scénario est invalidé.'] : []),
    ],
    risques: ['Tu perds toute possibilité de profiter d’une suite favorable.', 'Sortir sous le coup de l’émotion est une erreur fréquente : vérifie que c’est un choix et pas une panique.'],
    ce_qui_ferait_changer_d_avis: 'Si ton scénario de départ est toujours valable et que ta perte reste dans ce que tu avais prévu, tu peux garder.',
    chiffres: { gain_perte_latent: gainNow, quantite_detenue: held.quantity, valeur_position: held.value },
  });

  if (canBuy) {
    options.push({
      action: 'acheter',
      pourquoi: [
        'Renforcer une position gagnante peut se défendre si ton scénario se confirme.',
        highExposure ? 'Attention : ton exposition est déjà élevée.' : 'Il te reste du cash pour renforcer.',
      ],
      risques: [
        'Renforcer une position perdante pour “moyenner” augmente la perte potentielle : à éviter sans scénario clair.',
        'Plus la position grossit, plus un mouvement contraire pèse sur ton portefeuille.',
      ],
      ce_qui_ferait_changer_d_avis: 'Si ton exposition dépasse ce que tu peux supporter, ou si la position est dans le rouge, ne renforce pas.',
      chiffres: { quantite_max_avec_le_cash: maxBuy(state.cash, price), exposition_actuelle_pct: pct(state.exposure) },
    });
  }
  return options;
}

export function buildTradingOptions(session: SessionData, participantId: string, onlySymbol?: string): TradingOptions {
  const state = liveState(session, participantId);
  const alerts = evaluateGuide(session, participantId);
  const symbols = onlySymbol && session.symbols.includes(onlySymbol) ? [onlySymbol] : session.symbols;
  const minutesLeft = Math.max(0, session.durationMinutes - state.minute);

  const actifs: AssetOptions[] = symbols.map((symbol) => {
    const rawPrice = priceAt(session.prices, symbol, state.minute);
    const price = rawPrice === undefined ? null : roundPrice(rawPrice);
    const held = state.positions.find((p) => p.symbol === symbol);
    const move = recentMove(session, symbol, state.minute);
    const quantity = maxBuy(state.cash, price);
    const endingSoon = minutesLeft <= GUIDE_THRESHOLDS.endingMinutesLeft;

    const canBuy = quantity > 0 && !endingSoon;
    const buyBlock = price === null ? 'Prix indisponible pour cet actif.' : quantity <= 0 ? 'Cash insuffisant : il ne te reste pas assez pour acheter.' : endingSoon ? 'La séance est presque terminée.' : undefined;
    const canSell = held !== undefined && held.quantity > 0;

    return {
      actif: symbol,
      prix_actuel: price,
      variation_5_min_pct: move,
      peut_acheter: canBuy,
      ...(buyBlock && !canBuy ? { achat_impossible_car: buyBlock } : {}),
      quantite_max_achat: canBuy ? quantity : 0,
      peut_vendre: canSell,
      ...(canSell ? {} : { vente_impossible_car: 'Tu ne détiens pas cet actif : la vente à découvert n’existe pas dans cette salle.' }),
      quantite_detenue: held?.quantity ?? 0,
      position: held
        ? {
            valeur: held.value,
            gain_perte_latent: held.unrealizedPnl,
            poids_pct: pct(held.weight),
            protegee: held.stopLoss !== null,
            stop_loss: held.stopLoss,
            take_profit: held.takeProfit,
          }
        : null,
      options: optionsForAsset(session, state, alerts, symbol, held, price, move),
    };
  });

  return {
    minute: state.minute,
    minutes_restantes: minutesLeft,
    cash: state.cash,
    valeur_totale: state.total,
    exposition_pct: pct(state.exposure),
    regles_de_la_salle: TRADING_RULES,
    actifs,
    points_de_vigilance: alerts.map((a) => ({ code: a.code, gravite: a.severity, constat: a.message })),
    rappel: TRADING_REMINDER,
  };
}

const ACTION_LABEL: Record<OptionAction, string> = {
  acheter: 'Renforcer la position',
  acheter_une_partie: 'Entrer en petite quantité',
  attendre: 'Attendre',
  garder: 'Garder la position',
  poser_un_stop: 'Poser un stop-loss',
  alleger: 'Alléger (vendre une partie)',
  cloturer: 'Clôturer (vendre tout)',
};

/**
 * Réponse écrite par le code (sans modèle) : ce que l'étudiant peut faire, avec les raisons.
 * Utilisée quand l'IA n'est pas disponible, pour ne jamais laisser sans aide.
 */
export function describeOptions(options: TradingOptions, symbol?: string): string {
  const assets = symbol ? options.actifs.filter((a) => a.actif === symbol) : options.actifs;
  const lines: string[] = [];
  const money = (v: number) => `${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} $`;
  lines.push(`Minute ${options.minute} (${options.minutes_restantes} minute${options.minutes_restantes > 1 ? 's' : ''} restante${options.minutes_restantes > 1 ? 's' : ''}). Tu as ${money(options.cash)} de cash.`);

  for (const asset of assets) {
    const head: string[] = [];
    head.push(asset.peut_acheter ? `${asset.actif} : tu peux acheter jusqu’à ${asset.quantite_max_achat} unité(s) avec ton cash` : `${asset.actif} : achat impossible (${asset.achat_impossible_car ?? 'indisponible'})`);
    head.push(asset.peut_vendre ? `tu peux vendre jusqu’à ${asset.quantite_detenue} unité(s) détenue(s)` : 'rien à vendre');
    lines.push('');
    lines.push(`${head.join(' ; ')}.`);
    for (const option of asset.options) {
      lines.push(`- ${ACTION_LABEL[option.action]} : ${option.pourquoi.join(' ')} Risque : ${option.risques[0] ?? 'aucun risque particulier.'} ${option.ce_qui_ferait_changer_d_avis}`);
    }
  }
  lines.push('');
  lines.push(options.rappel);
  return lines.join('\n');
}
