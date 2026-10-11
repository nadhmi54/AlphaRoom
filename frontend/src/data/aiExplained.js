// Contenu de la section "Intelligence Artificielle" (#how) de la home page :
// explique en termes simples pourquoi l'IA d'AlphaRoom est explicable (XAI).
// Volontairement générique : ce n'est pas la description d'un module précis.

export const AI_STEPS = [
  {
    id: 'analyse',
    title: 'Analyse',
    description:
      "L'IA observe le marché : évolution des prix, tendances, volatilité et volumes échangés pour chaque actif.",
  },
  {
    id: 'recommandation',
    title: 'Recommandation',
    description:
      "Elle propose une décision claire (acheter, vendre ou rester à l'écart) accompagnée d'un niveau de confiance.",
  },
  {
    id: 'explication',
    title: 'Explication',
    description:
      "Chaque recommandation est justifiée : l'IA montre les facteurs qui l'ont motivée et le poids de chacun. Jamais de boîte noire.",
  },
  {
    id: 'backtesting',
    title: 'Backtesting',
    description:
      "La stratégie est rejouée sur des données historiques pour vérifier qu'elle aurait tenu ses promesses, avant d'y engager du capital virtuel.",
  },
];

export const AI_PRINCIPLES = [
  {
    id: 'transparente',
    title: 'Transparente',
    image: '/images/ai/ai-transparente.jpg',
    imageAlt: "Une main qui touche une sphère de données d'intelligence artificielle",
    position: '30% 55%',
    accent: '#f472b6',
    description: 'Chaque décision est justifiée, tu vois ce qui a pesé dans la balance.',
  },
  {
    id: 'verifiable',
    title: 'Vérifiable',
    image: '/images/ai/ai-verifiable.jpg',
    imageAlt: "Un bouclier « Ai » entouré de coches de validation et d'alertes",
    position: '50% 40%',
    accent: '#2dd4bf',
    description: "Une recommandation est testée sur l'historique avant d'être suivie.",
  },
  {
    id: 'pedagogique',
    title: 'Pédagogique',
    image: '/images/ai/ai-pedagogique.jpg',
    imageAlt: 'Un cerveau numérique qui projette des graphiques explicatifs',
    position: '40% 50%',
    accent: '#818cf8',
    description: 'Comprendre le pourquoi, c’est apprendre à décider par soi-même.',
  },
];

// Exemple illustratif affiché dans la carte "Pourquoi cette recommandation ?".
// `weight` > 0 pousse vers l'achat, < 0 pousse vers la prudence.
export const AI_EXAMPLE = {
  symbol: 'XAU/USD',
  name: 'Or',
  signal: 'Achat',
  confidence: 78,
  factors: [
    { label: 'Tendance du prix', weight: 0.42 },
    { label: 'Momentum', weight: 0.27 },
    { label: 'Volatilité récente', weight: -0.18 },
    { label: 'Volume échangé', weight: -0.06 },
  ],
};
