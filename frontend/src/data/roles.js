// Rôles métier d'AlphaRoom (identiques à l'enum UserRole du backend).
export const ROLES = [
  { value: 'trader', label: 'Trader' },
  { value: 'analyst', label: 'Analyste' },
  { value: 'trainer', label: 'Formateur' },
  { value: 'game_master', label: 'Meneur de jeu' },
  { value: 'risk_manager', label: 'Risk manager' },
  { value: 'admin', label: 'Administrateur' },
];

// Description et couleur d'accent de chaque rôle (page Profil).
export const ROLE_INFO = {
  trader: { accent: '#2dd4bf', description: 'Passe des ordres, gère un portefeuille et suit les marchés en temps réel.' },
  analyst: { accent: '#818cf8', description: 'Analyse les marchés et les actifs, produit des recommandations.' },
  trainer: { accent: '#f59e0b', description: 'Conçoit et anime des parcours de formation financière.' },
  game_master: { accent: '#f472b6', description: 'Pilote les scénarios et les sessions de la salle de marché.' },
  risk_manager: { accent: '#fb7185', description: 'Mesure et surveille les risques : VaR, stress tests, limites.' },
  admin: { accent: '#d9b877', description: 'Administre les comptes, les rôles et le journal des actions.' },
};

export function roleLabel(value) {
  return ROLES.find((role) => role.value === value)?.label ?? value;
}

export const COUNTRIES = [
  ['TN', 'Tunisie'],
  ['FR', 'France'],
  ['DZ', 'Algérie'],
  ['MA', 'Maroc'],
  ['EG', 'Égypte'],
  ['BE', 'Belgique'],
  ['CH', 'Suisse'],
  ['CA', 'Canada'],
  ['DE', 'Allemagne'],
  ['ES', 'Espagne'],
  ['IT', 'Italie'],
  ['GB', 'Royaume-Uni'],
  ['US', 'États-Unis'],
  ['AE', 'Émirats arabes unis'],
  ['SA', 'Arabie saoudite'],
  ['QA', 'Qatar'],
];
