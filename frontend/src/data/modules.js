// Le module fonctionnel d'AlphaRoom affiché sur la home page (section
// "Modules", #features). Le prototype se concentre sur le module
// Portefeuille (ex M1 Marché) — les autres modules ont été retirés.
// `path` est la route de la page (déclarée dans src/routes/AppRoutes.jsx)
// et la carte affiche un lien « Ouvrir le module ».
export const MODULES = [
  {
    id: 'portefeuille',
    number: 'M1',
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
];
