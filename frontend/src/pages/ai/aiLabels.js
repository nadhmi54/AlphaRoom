// Libellés et formats partagés par les écrans IA.

export function evidenceLabel(evidence) {
  if (evidence.type === 'trade') return `exécution ${evidence.id}`;
  if (evidence.type === 'event') return `événement ${evidence.id}`;
  if (evidence.type === 'minute') return `minute ${evidence.value}`;
  return 'preuve';
}

export const STATUS_LABELS = {
  draft: 'Brouillon',
  validated: 'Validé',
};

export function statusLabel(report) {
  if (report.status === 'validated') return report.published ? 'Validé et publié' : 'Validé (non publié)';
  return STATUS_LABELS[report.status] ?? report.status;
}

export const MISSING_DATA_LABELS = {
  no_trades: 'Aucun ordre passé sur ce passage : il n’y a rien à mesurer.',
  no_equity: 'Valeur du portefeuille indisponible : certaines mesures n’ont pas pu être calculées.',
  anomalous_sells: 'Des ventes dépassent la quantité détenue (la vente à découvert n’est pas gérée).',
  no_expected_price: 'Prix attendu non fourni : le coût du slippage n’a pas pu être calculé.',
};

export const missingDataLabel = (code) => MISSING_DATA_LABELS[code] ?? code;

export const SOURCE_LABELS = {
  llm: 'Texte rédigé par l’IA, puis vérifié par le code',
  rules: 'Texte généré par le code (règles)',
};

export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Note affichée : la correction de l'enseignant remplace la note calculée. */
export function effectiveScore(criterion) {
  return criterion.teacherScore ?? criterion.score;
}

export const formatScore = (value, digits = 2) =>
  value === null || value === undefined ? '—' : String(Number(value.toFixed(digits))).replace('.', ',');

export const percent = (fraction, digits = 1) =>
  `${String(Number((fraction * 100).toFixed(digits))).replace('.', ',')} %`;

export const signedPercent = (fraction, digits = 1) =>
  fraction === 0 ? '0 %' : `${fraction < 0 ? '−' : '+'}${percent(Math.abs(fraction), digits)}`;

export const runLabel = (run) => `Passage ${run}`;

export const VERDICT_LABELS = {
  improved: 'Amélioré',
  unchanged: 'Inchangé',
  worsened: 'En baisse',
  not_comparable: 'Non comparable',
};
