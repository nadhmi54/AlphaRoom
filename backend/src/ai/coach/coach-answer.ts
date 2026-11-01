import type { ParticipantContext } from '../context/ai-context.js';
import type { Evidence } from '../metrics/metrics.js';
import { checkAdvice, checkNumbers, collectAllowedNumbers } from '../report/report-validator.js';
import type { ValidationIssue } from '../report/report-types.js';
import { formatNumber } from '../rubric/rubric.js';

/**
 * Réponses du coach et leur contrôle.
 *
 * Deux sources possibles pour une réponse :
 *   - le modèle de langage (si un fournisseur est configuré) — son texte est
 *     contrôlé ici avant d'être montré (chiffres, conseils, longueur) ;
 *   - le code (`buildRuleAnswer`) — texte pédagogique construit à partir des
 *     métriques, utilisé sans clé ou quand le contrôle refuse le texte du modèle.
 */

export const MAX_ANSWER_CHARS = 1500;

export type CoachIntent = 'exposure' | 'loss' | 'protection' | 'reaction' | 'score' | 'advice' | 'overview';

export interface CoachAnswer {
  text: string;
  evidence: Evidence[];
  intent: CoachIntent;
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const INTENTS: Array<[CoachIntent, RegExp]> = [
  // Les demandes d'avis d'investissement passent en premier : on ne les traite jamais comme une autre question.
  [
    'advice',
    /\b(achete|acheter|vends|vendre|dois[- ]je (?:acheter|vendre)|faut[- ]il (?:acheter|vendre)|va (?:monter|baisser)|prevision|predire|prediction|conseille|que faire)\b/,
  ],
  ['protection', /\b(stop|protection|take[- ]?profit|limite de perte)\b/],
  ['reaction', /\b(reagi|reaction|news|actualite|information|evenement|choc|delai)\b/],
  ['exposure', /\b(exposition|expose|risque|concentration|investi|position trop|taille)\b/],
  ['loss', /\b(perte|perdu|drawdown|baisse|chute|pourquoi|gain|resultat|pnl|rendement)\b/],
  ['score', /\b(note|bilan|score|bareme|evalu|corrige)\b/],
];

export function detectIntent(question: string): CoachIntent {
  const text = normalize(question);
  return INTENTS.find(([, regex]) => regex.test(text))?.[0] ?? 'overview';
}

const pct = (fraction: number) => `${formatNumber(Math.abs(fraction) * 100)} %`;
const signedPct = (fraction: number) => `${fraction < 0 ? '−' : '+'}${pct(fraction)}`;
const money = (value: number) => `${formatNumber(Math.abs(value), 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} $`;

/** Réponse pédagogique construite uniquement à partir des métriques du contexte. */
export function buildRuleAnswer(context: ParticipantContext, question: string): CoachAnswer {
  const m = context.participant;
  const intent = detectIntent(question);

  if (intent === 'advice') {
    return {
      intent,
      evidence: [],
      text:
        'Je ne peux pas te dire quoi acheter ou vendre, ni prévoir l’évolution des prix : je suis là pour t’aider à comprendre. ' +
        'Pour décider toi-même, regarde ton exposition (quelle part de ton capital est investie), ta protection (as-tu un stop-loss ?) ' +
        'et la réaction du marché aux événements. Pose-moi une question sur l’un de ces points et je te l’explique avec tes propres chiffres.',
    };
  }

  if (m.tradeCount === 0 || m.missingData.includes('no_trades')) {
    return {
      intent,
      evidence: [],
      text:
        'Tu n’as passé aucun ordre sur ce passage de la séance, donc je n’ai pas de résultat ni de risque à analyser. ' +
        'Passe un ordre sur le marché, puis demande-moi par exemple « pourquoi ai-je perdu ? » ou « mon risque est-il élevé ? ».',
    };
  }

  switch (intent) {
    case 'exposure': {
      const evidence = m.maxExposure.evidence;
      const where = m.concentration.value === null ? '' : ` Ta plus grosse position pesait ${pct(m.concentration.value)} de ce montant investi.`;
      return {
        intent,
        evidence,
        text:
          `Ton exposition maximale a atteint ${pct(m.maxExposure.value)} de ton capital. ` +
          'L’exposition est la part du capital investie en positions : plus elle est élevée, plus une variation de prix pèse sur ta valeur, dans les deux sens.' +
          where +
          ' Pour la réduire, on peut investir moins ou répartir sur plusieurs actifs : à toi de voir ce qui correspond à ton objectif de risque.',
      };
    }
    case 'loss': {
      const evidence = [...m.pnl.evidence, ...m.maxDrawdown.evidence];
      const dd = m.maxDrawdown.value === 0 ? 'Tu n’as subi aucune baisse depuis un sommet.' : `Ta plus forte baisse depuis un sommet (drawdown) a été de ${signedPct(m.maxDrawdown.value)}.`;
      const gain = m.pnl.value >= 0 ? 'un gain' : 'une perte';
      return {
        intent,
        evidence,
        text:
          `Sur ce passage, tu as ${gain} de ${money(m.pnl.value)}, soit un rendement de ${signedPct(m.returnRate.value)} sur ton capital de départ. ${dd} ` +
          'Le résultat dépend de la taille de ta position (ton exposition) et du mouvement de prix pendant que tu la détenais. ' +
          'Regarde à quelle minute la valeur de ton portefeuille a baissé et ce qui s’est passé sur le marché à ce moment-là.',
      };
    }
    case 'protection': {
      if (m.stopLossRatio.value === null) {
        return { intent, evidence: [], text: 'Je ne peux pas évaluer ta protection : tu n’as pas de position ouverte à protéger sur ce passage.' };
      }
      const protectedText =
        m.stopLossRatio.value >= 1
          ? 'Toutes tes positions avaient un stop-loss.'
          : m.stopLossRatio.value === 0
            ? 'Aucune de tes positions n’avait de stop-loss.'
            : `${pct(m.stopLossRatio.value)} de tes positions avaient un stop-loss.`;
      return {
        intent,
        evidence: m.stopLossRatio.evidence,
        text:
          `${protectedText} Un stop-loss ferme automatiquement une position quand le prix atteint un seuil que tu as fixé : il limite la perte maximale d’un mauvais scénario, sans te demander de réagir à temps. ` +
          'Il ne garantit pas le prix de sortie si le marché saute d’un coup.',
      };
    }
    case 'reaction': {
      const delays = m.reactionDelays.value;
      if (delays.length === 0) {
        return { intent, evidence: [], text: 'Aucun événement de marché (news, choc…) n’a eu lieu pendant ce passage, donc il n’y a pas de réaction à mesurer.' };
      }
      const lines = delays.map((d) =>
        d.minutes === null
          ? `événement ${d.eventType} à la minute ${d.eventMinute} : aucune exécution dans les 10 minutes qui suivent`
          : `événement ${d.eventType} à la minute ${d.eventMinute} : première exécution ${d.minutes} minute${d.minutes > 1 ? 's' : ''} plus tard (exécution ${d.tradeId})`,
      );
      return {
        intent,
        evidence: m.reactionDelays.evidence,
        text:
          `Voici ta réactivité : ${lines.join(' ; ')}. ` +
          'Réagir ne veut pas dire trader dans la précipitation : le but est de repérer l’événement, d’évaluer son effet sur tes positions, puis de décider en connaissance de cause.',
      };
    }
    case 'score':
      return {
        intent,
        evidence: [],
        text:
          'Ta note est calculée avec un barème visible, critère par critère (gestion du risque, maîtrise des pertes, protection des positions, réactivité, qualité des sorties). ' +
          'Chaque critère est noté à partir d’un chiffre mesuré sur tes ordres, puis ton enseignant relit et valide le bilan avant de te le montrer. ' +
          'Quand il est publié, ouvre « Pourquoi cette note ? » pour voir la règle et les preuves derrière chaque point.',
      };
    default:
      return {
        intent: 'overview',
        evidence: [...m.pnl.evidence, ...m.maxExposure.evidence],
        text:
          `Voici ton passage en résumé : résultat de ${signedPct(m.returnRate.value)} (${m.pnl.value >= 0 ? 'gain' : 'perte'} de ${money(m.pnl.value)}), ` +
          `exposition maximale de ${pct(m.maxExposure.value)} du capital, plus forte baisse de ${signedPct(m.maxDrawdown.value)}. ` +
          'Tu peux me demander : « mon risque est-il élevé ? », « pourquoi ai-je perdu ? », « ai-je bien réagi à la news ? » ou « à quoi sert un stop-loss ? ».',
      };
  }
}

/** Contrôle le texte du modèle : mêmes garde-fous que les bilans (chiffres réels, aucun conseil). */
export function validateCoachText(text: string, context: ParticipantContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const trimmed = text.trim();
  if (trimmed === '') return [{ code: 'invalid_shape', message: 'Réponse vide.' }];
  if (trimmed.length > MAX_ANSWER_CHARS) {
    issues.push({ code: 'too_long', message: `Réponse trop longue (max ${MAX_ANSWER_CHARS} caractères).` });
  }
  const allowed = collectAllowedNumbers(context, []);
  issues.push(...checkNumbers(trimmed, allowed, 'answer'), ...checkAdvice(trimmed, 'answer'));
  return issues;
}
