// Les 5 classes d'actifs couvertes par le simulateur — contenu pédagogique
// affiché sur la home page (section "Marchés", #markets). Les prix/variations
// sont des données d'exemple (même convention que TICKER_ITEMS), en attendant
// que le module "Marché, Trading & Portefeuille" (M1) fournisse de vraies
// données live (Alpha Vantage / Supabase).
export const MARKET_ASSETS = [
  {
    id: 'xau',
    image: '/images/markets/xau.jpg',
    category: 'Métaux précieux',
    symbol: 'XAU/USD',
    name: 'Or',
    price: '2,685.40',
    change: '+0.62%',
    up: true,
    description:
      "Valeur refuge historique. Recherché en période d'incertitude économique ou géopolitique, l'or sert de couverture contre l'inflation et évolue souvent à l'inverse du dollar.",
    facts: [
      { label: 'Unité', value: 'Once troy (oz)' },
      { label: 'Marché', value: 'OTC, 24h/24 · 5j/7' },
      { label: 'Volatilité', value: 'Faible à modérée' },
    ],
  },
  {
    id: 'xag',
    image: '/images/markets/xag.jpg',
    category: 'Métaux précieux',
    symbol: 'XAG/USD',
    name: 'Argent',
    price: '31.18',
    change: '+1.14%',
    up: true,
    description:
      "Métal précieux à double usage : investissement et industrie (électronique, panneaux solaires). Son marché plus restreint le rend plus volatil que l'or.",
    facts: [
      { label: 'Unité', value: 'Once troy (oz)' },
      { label: 'Marché', value: 'OTC, 24h/24 · 5j/7' },
      { label: 'Volatilité', value: 'Modérée à élevée' },
    ],
  },
  {
    id: 'oil',
    image: '/images/markets/oil.jpg',
    category: 'Matières premières',
    symbol: 'WTI/USD',
    name: 'Pétrole',
    price: '78.42',
    change: '-0.87%',
    up: false,
    description:
      "Baromètre de l'activité économique mondiale. Son prix est piloté par les décisions de l'OPEP+, la demande industrielle et les tensions géopolitiques.",
    facts: [
      { label: 'Unité', value: 'Baril (bbl)' },
      { label: 'Marché', value: 'Futures · NYMEX / ICE' },
      { label: 'Volatilité', value: 'Élevée' },
    ],
  },
  {
    id: 'eurusd',
    image: '/images/markets/eurusd.jpg',
    category: 'Devises (Forex)',
    symbol: 'EUR/USD',
    name: 'Euro / Dollar',
    price: '1.0842',
    change: '-0.21%',
    up: false,
    description:
      "La paire de devises la plus échangée au monde. Elle reflète l'écart de politique monétaire et de croissance entre la zone euro et les États-Unis.",
    facts: [
      { label: 'Unité', value: '1 lot = 100 000 EUR' },
      { label: 'Marché', value: 'Forex, dim. 22h → ven. 22h' },
      { label: 'Volatilité', value: 'Modérée' },
    ],
  },
  {
    id: 'sp500',
    image: '/images/markets/sp500.jpg',
    category: 'Indices actions',
    symbol: 'SPX',
    name: 'S&P 500',
    price: '5,842.30',
    change: '+0.84%',
    up: true,
    description:
      'Indice regroupant les 500 plus grandes capitalisations américaines cotées. Référence mondiale pour mesurer la performance des marchés actions.',
    facts: [
      { label: 'Composition', value: '500 valeurs · 11 secteurs' },
      { label: 'Marché', value: 'NYSE / Nasdaq' },
      { label: 'Volatilité', value: 'Modérée' },
    ],
  },
];
