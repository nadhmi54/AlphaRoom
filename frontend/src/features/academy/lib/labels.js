// Petits libellés d'affichage propres à l'Academy (aucune logique métier ici :
// les critères viennent du serveur, on ne fait que les rendre lisibles).

const CRITERIA_FORMAT = {
  minReturnPercent: { label: 'Rendement minimal', format: (value) => `${value} %` },
  maxDrawdownLimit: {
    label: 'Drawdown maximal autorisé',
    format: (value) => `${Math.round(value * 100)} %`,
  },
  minSharpe: { label: 'Ratio de Sharpe minimal', format: (value) => String(value) },
  minOrders: { label: 'Nombre d’ordres minimal', format: (value) => String(value) },
  minAssets: { label: 'Nombre d’actifs minimal', format: (value) => String(value) },
  minDurationSeconds: {
    label: 'Durée minimale',
    format: (value) => `${Math.round(value / 60)} min`,
  },
  maxDurationSeconds: {
    label: 'Durée maximale',
    format: (value) => `${Math.round(value / 60)} min`,
  },
};

/** Transforme les critères d'une mission en lignes lisibles (libellé + valeur). */
export function describeCriteria(criteria) {
  if (!criteria) return [];
  return Object.entries(CRITERIA_FORMAT)
    .filter(([key]) => criteria[key] !== undefined && criteria[key] !== null)
    .map(([key, definition]) => ({
      key,
      label: definition.label,
      value: definition.format(criteria[key]),
    }));
}

const BADGE_KIND_LABELS = {
  level: 'Niveau',
  skill: 'Compétence',
  achievement: 'Réussite',
};

export function badgeKindLabel(kind) {
  return BADGE_KIND_LABELS[kind] ?? 'Badge';
}

// Les badges stockent une CLÉ d'icône (ex. « trophee »), pas un glyphe : sans
// cette table, la clé s'affichait en texte brut. On associe chaque clé connue à
// un emoji et on retombe sur une étoile pour une clé inconnue ou absente.
const BADGE_ICONS = {
  niveau: '🎓',
  trophee: '🏆',
  bouclier: '🛡️',
  flamme: '🔥',
  risque: '⚖️',
  etoile: '⭐',
};

/** Emoji d'un badge à partir de sa clé d'icône (jamais de texte brut). */
export function badgeIcon(icon) {
  if (typeof icon !== 'string') return '★';
  return BADGE_ICONS[icon.trim().toLowerCase()] ?? '★';
}

/** État d'une mission du point de vue du joueur (verrouillée, disponible, réussie). */
const MISSION_STATE_LABELS = {
  locked: 'Verrouillée',
  available: 'Disponible',
  passed: 'Réussie',
};

export function missionStateLabel(state) {
  return MISSION_STATE_LABELS[state] ?? 'Verrouillée';
}

const LESSON_KIND_LABELS = {
  text: 'Lecture',
  video: 'Vidéo',
  link: 'Ressource',
};

export function lessonKindLabel(kind) {
  return LESSON_KIND_LABELS[kind] ?? 'Leçon';
}

/** Date seule (jour/mois/année) pour la fenêtre d'une mission ou un badge. */
export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Décrit la fenêtre de validité d'une mission (« du ... au ... »). */
export function describeWindow(startsAt, endsAt) {
  const start = formatDate(startsAt);
  const end = formatDate(endsAt);
  if (start && end) return `Du ${start} au ${end}`;
  if (start) return `À partir du ${start}`;
  if (end) return `Jusqu’au ${end}`;
  return 'Sans limite de date';
}
