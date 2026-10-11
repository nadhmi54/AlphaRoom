// Les 6 modules fonctionnels d'AlphaRoom, affichés sur la home page (section
// "Modules", #features). Contenu issu du README du projet. Chaque équipe
// a sa page dans src/pages/Modules/<Module>/ ; `path` est la route de cette
// page (déclarée dans src/routes/AppRoutes.jsx) et la carte affiche un lien
// « Ouvrir le module ».
export const MODULES = [
  {
    id: 'm1',
    number: 'M1',
    title: 'Marché, Trading & Portefeuille',
    role: 'Trader',
    question: 'Comment trader et gérer son portefeuille ?',
    description:
      'Consulte les prix, passe des ordres Market, Limit et Stop simulés, puis suis ton portefeuille virtuel : positions, cash, P&L et exposition.',
    tags: ['Ordres simulés', 'P&L', 'Exposition'],
    accent: '#d9b877',
    image: '/images/modules/m1-marche.jpg',
    imageAlt: "Graphique de marché avec chandeliers et courbes de prix",
    path: '/marche',
  },
  {
    id: 'm2',
    number: 'M2',
    title: 'Intelligence de Marché & IA',
    role: 'Analyste / IA',
    question: "Comment analyser le marché et utiliser l'IA pour décider ?",
    description:
      "Analyse technique, backtesting, mesure du risque de marché (VaR, Monte Carlo) et recommandations d'une IA dont chaque décision est expliquée.",
    tags: ['Indicateurs techniques', 'VaR & Monte Carlo', 'IA explicable'],
    accent: '#2dd4bf',
    image: '/images/modules/m2-intelligence-ia.jpg',
    imageAlt: "Analyste devant plusieurs écrans de graphiques financiers",
    path: '/intelligence-ia',
  },
  {
    id: 'm3',
    number: 'M3',
    title: 'Formation & Pédagogie',
    role: 'Formateur',
    question: 'Comment apprendre le trading et la finance pas à pas ?',
    description:
      'Des parcours progressifs, des exercices pratiques et le suivi de ta progression pour passer de la théorie à la pratique.',
    tags: ['Parcours', 'Exercices', 'Progression'],
    accent: '#818cf8',
    image: '/images/modules/m3-formation.jpg',
    imageAlt: "Chapeau de diplômé au centre d'une interface holographique",
    path: '/formation',
  },
  {
    id: 'm4',
    number: 'M4',
    title: 'Meneur de Jeu & Simulation Historique',
    role: 'Meneur de jeu',
    question: 'Tu es en 2014. Quelle décision prends-tu ?',
    description:
      'Un meneur de jeu crée une simulation à partir de données historiques réelles : les joueurs décident sans connaître les événements futurs.',
    tags: ['Données historiques', 'Meneur de jeu', 'Sans connaître le futur'],
    accent: '#34d399',
    image: '/images/modules/m4-meneur-jeu.jpg',
    imageAlt: "Pièces d'échecs devant des chandeliers de marché",
    path: '/meneur-de-jeu',
  },
  {
    id: 'm5',
    number: 'M5',
    title: 'Stress Testing Bancaire',
    role: 'Risk Manager',
    question: 'Comment une banque résiste-t-elle à une crise ?',
    description:
      "Évalue la capacité d'une banque à encaisser différents scénarios de crise financière et mesure sa résilience.",
    tags: ['Scénarios de crise', 'Résilience bancaire'],
    accent: '#f87171',
    image: '/images/modules/m5-stress-testing.jpg',
    imageAlt: "Balance équilibrant le mot RISK",
    path: '/stress-testing',
  },
  {
    id: 'm6',
    number: 'M6',
    title: "Actuariat & Risque d'Assurance",
    role: 'Actuaire',
    question: "Comment modéliser et prévoir les risques liés à l'assurance ?",
    description:
      "Modélise et analyse les risques des activités d'assurance pour mieux les anticiper.",
    tags: ['Modélisation', 'Prévision', "Risque d'assurance"],
    accent: '#fb923c',
    image: '/images/modules/m6-actuariat.jpg',
    imageAlt: "Main touchant un bouton START entouré d'icônes d'analyse",
    path: '/actuariat',
  },
];
