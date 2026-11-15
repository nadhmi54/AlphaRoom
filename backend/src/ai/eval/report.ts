import { CATEGORY_LABELS, type CaseResult, type EvalCategory } from './eval-types.js';
import type { EvalSummary } from './scoring.js';

const pct = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)} %`);

/** Rapport Markdown : tableau de synthèse pour la soutenance, puis le détail de chaque échec. */
export function renderReport(results: CaseResult[], summary: EvalSummary, model: string, date = new Date()): string {
  const lines: string[] = [];
  lines.push('# Évaluation du coach IA AlphaRoom', '');
  lines.push(`Modèle : **${model}** · Date : ${date.toISOString().slice(0, 10)} · Questions : ${summary.total}`, '');
  lines.push('Chaque question est posée au coach avec les mêmes outils et le même prompt qu’en production, sur un décor fixe (séance et historique de marché déterministes). La réponse est notée automatiquement : bon outil consulté, chiffres tous vérifiés, éléments attendus présents, éléments interdits absents.', '');
  lines.push('## Résultats', '');
  lines.push('| Indicateur | Valeur |', '|---|---|');
  lines.push(`| Questions réussies | **${summary.passed} / ${summary.total} (${pct(summary.score)})** |`);
  lines.push(`| Fidélité des chiffres (aucun chiffre inventé) | ${pct(summary.faithfulness)} |`);
  lines.push(`| Choix du bon outil | ${pct(summary.toolChoice)} |`);
  lines.push(`| Résistance aux injections / fuites | ${pct(summary.safety)} |`);
  lines.push(`| Étapes moyennes par réponse | ${summary.averageSteps.toFixed(1)} |`);
  lines.push(`| Jetons moyens par réponse | ${Math.round(summary.averageTokens)} |`);
  lines.push(`| Durée moyenne | ${summary.averageSeconds.toFixed(1)} s |`, '');
  lines.push('## Par catégorie', '');
  lines.push('| Catégorie | Réussies |', '|---|---|');
  for (const row of summary.byCategory) {
    lines.push(`| ${CATEGORY_LABELS[row.category as EvalCategory] ?? row.category} | ${row.passed} / ${row.total} (${pct(row.passed / row.total)}) |`);
  }
  lines.push('');
  const failures = results.filter((r) => !r.passed);
  lines.push('## Échecs à examiner', '');
  if (failures.length === 0) lines.push('Aucun échec sur ce jeu de questions.', '');
  for (const r of failures) {
    lines.push(`### ${r.case.id} — ${r.case.question}`, '');
    for (const check of r.checks.filter((c) => !c.passed)) lines.push(`- **${check.name}** : ${check.detail}`);
    lines.push('', `> ${(r.run.text ?? '(pas de réponse)').replace(/\s+/g, ' ').slice(0, 400)}`, '');
  }
  lines.push('## Limites de cette évaluation', '');
  lines.push('- Le jeu de questions est écrit par l’équipe : il mesure la régression et les comportements attendus, pas la satisfaction réelle des étudiants.');
  lines.push('- Les contrôles de contenu sont des motifs de texte : un échec peut être une reformulation correcte, à relire dans la section ci-dessus.');
  lines.push('- Un modèle de langage varie d’un essai à l’autre : relancer l’évaluation peut changer quelques résultats.', '');
  return lines.join('\n');
}
