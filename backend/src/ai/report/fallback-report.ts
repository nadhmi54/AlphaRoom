import type { Evidence } from '../metrics/metrics.js';
import type { CriterionScore, OverallScore } from '../rubric/rubric.js';
import type { LlmReportParts, ReportPoint } from './report-types.js';

/**
 * Texte du rapport généré PAR LE CODE, sans modèle de langage : il sert de
 * secours quand le fournisseur est indisponible ou que ses réponses sont
 * refusées par le validateur. L'enseignant a ainsi toujours un brouillon,
 * moins fluide mais strictement fidèle aux chiffres.
 *
 * Chaque phrase part de la valeur mesurée (`displayValue`) et du niveau de la
 * note ; elle n'ajoute aucun autre chiffre. La règle complète reste affichée
 * à part, sous chaque critère.
 */

/** Niveau de la note : « good » (3 et plus), « mid » (2), « low » (1 et moins). */
type Level = 'good' | 'mid' | 'low';
const levelOf = (score: number | null): Level => ((score ?? 0) >= 3 ? 'good' : (score ?? 0) >= 2 ? 'mid' : 'low');

const COMMENTS: Record<string, (value: string, level: Level) => string> = {
  gestion_risque: (v, level) =>
    level === 'good'
      ? `Ton exposition maximale est restée à ${v} du capital : tu as gardé une marge pour absorber un mouvement de prix défavorable.`
      : level === 'mid'
        ? `Ton exposition maximale a atteint ${v} du capital : une part importante de ton capital était soumise aux variations de prix.`
        : `Ton exposition maximale a atteint ${v} du capital : presque tout était investi, donc une baisse de prix pesait très lourd sur ta valeur.`,
  maitrise_pertes: (v, level) =>
    level === 'good'
      ? `Ta plus forte baisse depuis un sommet a été de ${v} : tes pertes sont restées contenues.`
      : level === 'mid'
        ? `Ta plus forte baisse depuis un sommet a été de ${v} : c’est un niveau à surveiller.`
        : `Ta plus forte baisse depuis un sommet a été de ${v} : cela a fortement entamé ton capital.`,
  protection_positions: (v, level) =>
    level === 'good'
      ? `${v} de tes positions avaient un stop-loss : tu limitais la perte maximale à l’avance.`
      : level === 'mid'
        ? `Seulement ${v} de tes positions avaient un stop-loss : la protection reste partielle.`
        : `${v} de tes positions avaient un stop-loss : une chute brutale n’était pas limitée à l’avance.`,
  reactivite: (v, level) =>
    v === 'aucune réaction'
      ? 'Tu n’as passé aucun ordre après les événements de marché : la situation a changé sans que tu ajustes tes positions.'
      : level === 'good'
        ? `Ton délai moyen de réaction a été de ${v} : tu as réagi vite aux événements.`
        : `Ton délai moyen de réaction a été de ${v} : tu as réagi tardivement aux événements.`,
  qualite_sorties: (v, level) =>
    level === 'good'
      ? `Ton ratio gain/perte est de ${v} : tes gains compensent bien tes pertes.`
      : level === 'mid'
        ? `Ton ratio gain/perte est de ${v} : tes gains compensent à peine tes pertes.`
        : `Ton ratio gain/perte est de ${v} : tes pertes pèsent plus que tes gains.`,
};

const IMPROVEMENTS: Record<string, (value: string) => string> = {
  gestion_risque: (v) => `Réduis la taille de tes positions : ton exposition maximale a atteint ${v} du capital.`,
  maitrise_pertes: (v) => `Cherche à limiter tes pertes : ta plus forte baisse depuis un sommet a été de ${v}.`,
  protection_positions: (v) => `Pose un stop-loss sur tes positions : seulement ${v} en avaient un.`,
  reactivite: (v) =>
    v === 'aucune réaction'
      ? 'Surveille les événements de marché et ajuste tes positions après une news ou un choc de prix.'
      : `Réagis plus vite aux événements : ton délai moyen était de ${v}.`,
  qualite_sorties: (v) => `Améliore le rapport entre tes gains et tes pertes : ton ratio gain/perte est de ${v}.`,
};

const STRENGTHS: Record<string, (value: string) => string> = {
  gestion_risque: (v) => `Exposition bien maîtrisée : ${v} du capital au maximum.`,
  maitrise_pertes: (v) => `Pertes contenues : ta plus forte baisse a été de ${v}.`,
  protection_positions: (v) => `Tu protèges tes positions : ${v} avaient un stop-loss.`,
  reactivite: (v) => `Bonne réactivité aux événements : délai moyen de ${v}.`,
  qualite_sorties: (v) => `Bonnes sorties : ton ratio gain/perte est de ${v}.`,
};

function describe(map: Record<string, (value: string) => string>, c: CriterionScore): ReportPoint {
  const value = c.displayValue ?? '';
  return { text: map[c.id]?.(value) ?? c.rule, evidence: c.evidence };
}

export function buildFallbackParts(criteria: CriterionScore[], overall: OverallScore): LlmReportParts {
  const evaluated = criteria.filter((c) => c.status === 'evaluated' && c.score !== null);

  return {
    summary: buildSummary(evaluated, overall),
    criteria: criteria.map((c) => ({
      id: c.id,
      comment:
        c.status === 'evaluated'
          ? (COMMENTS[c.id]?.(c.displayValue ?? '', levelOf(c.score)) ?? c.rule)
          : `${c.label} : non évalué. ${c.reason ?? ''}`.trim(),
      evidence: c.status === 'evaluated' ? c.evidence : ([] as Evidence[]),
    })),
    strengths: evaluated
      .filter((c) => (c.score ?? 0) >= 3 && c.evidence.length > 0)
      .slice(0, 5)
      .map((c) => describe(STRENGTHS, c)),
    improvements: evaluated
      .filter((c) => (c.score ?? 4) <= 2 && c.evidence.length > 0)
      .slice(0, 5)
      .map((c) => describe(IMPROVEMENTS, c)),
  };
}

function buildSummary(evaluated: CriterionScore[], overall: OverallScore): string {
  if (overall.score === null) {
    return 'Aucun critère n’a pu être évalué sur cette séance : voir le détail de chaque critère.';
  }
  const best = [...evaluated].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const worst = [...evaluated].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
  const parts = [`Note globale : ${String(overall.score).replace('.', ',')} sur ${overall.outOf}.`];
  if (best && worst && best.id !== worst.id && best.score !== worst.score) {
    parts.push(`Point le plus solide : ${best.label.toLowerCase()}. À travailler en priorité : ${worst.label.toLowerCase()}.`);
  }
  if (overall.partial) parts.push('Certains critères n’ont pas pu être mesurés faute de données.');
  return parts.join(' ');
}
