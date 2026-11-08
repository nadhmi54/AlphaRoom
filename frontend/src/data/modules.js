// Modules fonctionnels d'AlphaRoom affichés sur la home page.
// M1 : Salle de marché classique (inchangée).
// M2 : Game Room — Salle de simulation pédagogique multi-participants.
// `roles` absent = module ouvert à tous les comptes connectés.
import { TRADING_ROLES } from './roles.js';

export const MODULES = [
  {
    id: 'portefeuille',
    number: 'M1',
    roles: TRADING_ROLES,
    title: 'Marché, Trading & Portefeuille',
    role: 'Trader',
    question: 'Comment trader et gérer son portefeuille ?',
    description:
      'Consulte les prix, passe des ordres Market, Limit et Stop simulés, puis suis ton portefeuille virtuel : positions, cash, P&L et exposition.',
    tags: ['Carnet d’ordres', 'P&L', 'Exposition'],
    accent: '#d9b877',
    image: '/images/modules/m1-marche.jpg',
    imageAlt: "Graphique de marché avec chandeliers et courbes de prix",
    path: '/marche',
  },
  {
    id: 'game-room',
    number: 'M2',
    title: 'Game Room — Simulation Pédagogique',
    role: 'Étudiant & Formateur',
    question: 'Comment réagir face aux scénarios de crise et chocs de marché ?',
    description:
      'Participe à des séances de marché scénarisées (« Le mardi de la panique »). Portefeuille virtuel dédié (100 000 $), carnet dynamique, contrôles formateur, rollback et assistant IA.',
    tags: ['Multi-participants', 'Scénarios & Chocs', 'Meneur de jeu', 'Rollback', 'Assistant IA'],
    accent: '#3fd1a0',
    image: '/images/modules/m4-meneur-jeu.jpg',
    imageAlt: 'Salle de simulation pédagogique avec contrôle enseignant et participants',
    path: '/game-room',
  },
  {
    id: 'actuariat',
    number: 'M6',
    title: "Actuariat & Risque d'Assurance",
    role: 'Actuaire / Analyste assurance',
    question: "Comment modéliser et prévoir les risques liés à l'assurance ?",
    description:
      'Estime une prime automobile à partir du profil conducteur, du véhicule et des garanties, puis observe l’impact de chaque facteur sur le risque.',
    tags: ['Tarification', 'Bonus / malus', 'Garanties'],
    accent: '#79b89b',
    image: '/images/modules/m6-actuariat.jpg',
    imageAlt: 'Données et indicateurs d’analyse actuarielle',
    path: '/actuariat',
  },
];
