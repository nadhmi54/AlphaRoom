// Les 4 marchés couverts par le simulateur — contenu pédagogique
// affiché sur la page d'accueil (section "Marchés", #markets) :
// Crypto, Actions, Matières premières et Devises.
// Les prix/variations sont des données d'exemple, en attendant
// que le module "Marché, Trading & Portefeuille" (M1) fournisse de vraies
// données live (Alpha Vantage / Supabase).
export const MARKET_ASSETS = [
  {
    id: 'crypto',
    accent: '#f59e0b',
    glyph: 'BTC',
    category: 'Cryptomonnaies',
    symbol: 'BTC/USD',
    name: 'Crypto',
    assetName: 'Bitcoin',
    price: '67,500.00',
    change: '+2.84%',
    up: true,
    description:
      "Marché d'actifs numériques décentralisés négociable 24h/24 et 7j/7 sans fermeture. Le Bitcoin en est la référence incontournable, caractérisé par sa forte volatilité et ses cycles de halving.",
    facts: [
      { label: 'Unité', value: '1 BTC (satoshi)' },
      { label: 'Marché', value: 'Crypto · 24h/24 · 7j/7' },
      { label: 'Volatilité', value: 'Très élevée' },
    ],
  },
  {
    id: 'actions',
    accent: '#60a5fa',
    glyph: 'SPX',
    category: 'Actions & Indices',
    symbol: 'SPX',
    name: 'Actions',
    assetName: 'S&P 500',
    price: '5,842.30',
    change: '+0.84%',
    up: true,
    description:
      "Indice regroupant les 500 plus grandes capitalisations américaines cotées. Référence mondiale pour mesurer la performance des marchés actions et l'impact des résultats d'entreprises.",
    facts: [
      { label: 'Composition', value: '500 valeurs · 11 secteurs' },
      { label: 'Marché', value: 'NYSE / Nasdaq · 15h30 → 22h00' },
      { label: 'Volatilité', value: 'Modérée' },
    ],
  },
  {
    id: 'matieres-premieres',
    accent: '#d9b877',
    glyph: 'Au',
    category: 'Matières premières',
    symbol: 'XAU/USD',
    name: 'Matières premières',
    assetName: 'Or',
    price: '2,685.40',
    change: '+0.62%',
    up: true,
    description:
      "Valeur refuge historique et matières premières physiques (métaux précieux, énergies, agricoles). L'or sert de couverture contre l'inflation et les chocs géopolitiques mondiaux.",
    facts: [
      { label: 'Unité', value: 'Once troy (oz)' },
      { label: 'Marché', value: 'OTC / COMEX · 24h/24 · 5j/7' },
      { label: 'Volatilité', value: 'Faible à modérée' },
    ],
  },
  {
    id: 'devises',
    accent: '#2dd4bf',
    glyph: '€/$',
    category: 'Devises (Forex)',
    symbol: 'EUR/USD',
    name: 'Devises',
    assetName: 'Euro/Dollar',
    price: '1.0842',
    change: '-0.21%',
    up: false,
    description:
      "Le plus grand marché financier au monde avec plus de 7 500 milliards de dollars échangés par jour. La paire EUR/USD reflète l'équilibre économique entre la zone euro et les États-Unis.",
    facts: [
      { label: 'Unité', value: '1 lot = 100 000 EUR' },
      { label: 'Marché', value: 'Forex interbancaire · 24h/24 · 5j/7' },
      { label: 'Volatilité', value: 'Modérée' },
    ],
  },
];
