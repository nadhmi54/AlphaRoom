// Données factices pour le bandeau de cotations de la page d'accueil, en
// attendant que le module "Marché, Trading & Portefeuille" (M1) fournisse de
// vraies données de marché (Alpha Vantage / Supabase). Regroupées ici plutôt
// que codées en dur dans le composant Header.
export const TICKER_ITEMS = [
  { symbol: 'S&P 500', value: '+0.84%', up: true },
  { symbol: 'CAC 40', value: '+0.31%', up: true },
  { symbol: 'BTC/USD', value: '64,230', up: true },
  { symbol: 'EUR/USD', value: '1.0842', up: false },
  { symbol: 'XAU/USD', value: '2,685.40', up: true },
  { symbol: 'TSLA', value: '-1.24%', up: false },
  { symbol: 'AAPL', value: '+2.10%', up: true },
  { symbol: 'OAT 10Y', value: '3.12%', up: false },
];
