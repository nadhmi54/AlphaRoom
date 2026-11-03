// Actifs négociables d'une Game Room.
// Miroir de backend/src/portefeuille/trading/market-assets.ts.
// Supporte les 4 grands marchés : Crypto, Actions, Matières premières, Devises.
export const ROOM_ASSETS = [
  // ── Matières premières ────────────────────────────────────────────────────
  { symbol: 'XAU/USD', name: 'Or', unit: 'once troy (oz)', unitShort: 'oz', category: 'Matières premières', marketId: 'commodity', price: 2685.4, decimals: 2, qtyDecimals: 3 },
  { symbol: 'XAG/USD', name: 'Argent', unit: 'once troy (oz)', unitShort: 'oz', category: 'Matières premières', marketId: 'commodity', price: 31.25, decimals: 2, qtyDecimals: 3 },
  { symbol: 'WTI/USD', name: 'Pétrole WTI', unit: 'baril', unitShort: 'bbl', category: 'Matières premières', marketId: 'commodity', price: 72.4, decimals: 2, qtyDecimals: 2 },
  { symbol: 'BRENT/USD', name: 'Pétrole Brent', unit: 'baril', unitShort: 'bbl', category: 'Matières premières', marketId: 'commodity', price: 76.1, decimals: 2, qtyDecimals: 2 },
  { symbol: 'NATGAS/USD', name: 'Gaz naturel', unit: 'MMBtu', unitShort: 'MMBtu', category: 'Matières premières', marketId: 'commodity', price: 2.95, decimals: 3, qtyDecimals: 1 },
  { symbol: 'COPPER/USD', name: 'Cuivre', unit: 'livre', unitShort: 'lb', category: 'Matières premières', marketId: 'commodity', price: 4.35, decimals: 3, qtyDecimals: 2 },

  // ── Devises (Forex) ───────────────────────────────────────────────────────
  { symbol: 'EUR/USD', name: 'Euro/Dollar', unit: 'EUR', unitShort: 'EUR', category: 'Forex', marketId: 'forex', price: 1.0834, decimals: 4, qtyDecimals: 2 },
  { symbol: 'GBP/USD', name: 'Livre sterling/Dollar', unit: 'GBP', unitShort: 'GBP', category: 'Forex', marketId: 'forex', price: 1.2712, decimals: 4, qtyDecimals: 2 },
  { symbol: 'USD/JPY', name: 'Dollar/Yen', unit: 'USD', unitShort: 'USD', category: 'Forex', marketId: 'forex', price: 149.85, decimals: 2, qtyDecimals: 2 },
  { symbol: 'USD/CHF', name: 'Dollar/Franc suisse', unit: 'USD', unitShort: 'USD', category: 'Forex', marketId: 'forex', price: 0.882, decimals: 4, qtyDecimals: 2 },
  { symbol: 'AUD/USD', name: 'Dollar australien/Dollar', unit: 'AUD', unitShort: 'AUD', category: 'Forex', marketId: 'forex', price: 0.658, decimals: 4, qtyDecimals: 2 },
  { symbol: 'USD/CAD', name: 'Dollar/Dollar canadien', unit: 'USD', unitShort: 'USD', category: 'Forex', marketId: 'forex', price: 1.364, decimals: 4, qtyDecimals: 2 },

  // ── Crypto ────────────────────────────────────────────────────────────────
  { symbol: 'BTC/USD', name: 'Bitcoin', unit: 'BTC', unitShort: 'BTC', category: 'Crypto', marketId: 'crypto', price: 67500, decimals: 2, qtyDecimals: 6 },
  { symbol: 'ETH/USDT', name: 'Ethereum', unit: 'ETH', unitShort: 'ETH', category: 'Crypto', marketId: 'crypto', price: 2600, decimals: 2, qtyDecimals: 5 },
  { symbol: 'SOL/USDT', name: 'Solana', unit: 'SOL', unitShort: 'SOL', category: 'Crypto', marketId: 'crypto', price: 175, decimals: 2, qtyDecimals: 4 },
  { symbol: 'BNB/USDT', name: 'BNB', unit: 'BNB', unitShort: 'BNB', category: 'Crypto', marketId: 'crypto', price: 590, decimals: 2, qtyDecimals: 4 },
  { symbol: 'XRP/USDT', name: 'XRP', unit: 'XRP', unitShort: 'XRP', category: 'Crypto', marketId: 'crypto', price: 0.55, decimals: 4, qtyDecimals: 2 },

  // ── Actions ───────────────────────────────────────────────────────────────
  { symbol: 'AAPL', name: 'Apple', unit: 'action', unitShort: 'act.', category: 'Actions', marketId: 'stock', price: 224.5, decimals: 2, qtyDecimals: 2 },
  { symbol: 'MSFT', name: 'Microsoft', unit: 'action', unitShort: 'act.', category: 'Actions', marketId: 'stock', price: 421.3, decimals: 2, qtyDecimals: 2 },
  { symbol: 'GOOGL', name: 'Alphabet (Google)', unit: 'action', unitShort: 'act.', category: 'Actions', marketId: 'stock', price: 172.8, decimals: 2, qtyDecimals: 2 },
  { symbol: 'AMZN', name: 'Amazon', unit: 'action', unitShort: 'act.', category: 'Actions', marketId: 'stock', price: 186.4, decimals: 2, qtyDecimals: 2 },
  { symbol: 'TSLA', name: 'Tesla', unit: 'action', unitShort: 'act.', category: 'Actions', marketId: 'stock', price: 248.9, decimals: 2, qtyDecimals: 2 },
  { symbol: 'NVDA', name: 'NVIDIA', unit: 'action', unitShort: 'act.', category: 'Actions', marketId: 'stock', price: 118.6, decimals: 2, qtyDecimals: 2 },
  { symbol: 'META', name: 'Meta Platforms', unit: 'action', category: 'Actions', marketId: 'stock', price: 512.4, decimals: 2, qtyDecimals: 2 },
];

// Métadonnées neutres d'un actif inconnu
const UNKNOWN_ROOM_ASSET = {
  symbol: '',
  name: 'Actif inconnu',
  unit: 'unité',
  unitShort: 'u.',
  category: 'Autre',
  marketId: 'crypto',
  price: 0,
  decimals: 2,
  qtyDecimals: 6,
};

export function findRoomAsset(symbol) {
  const asset = ROOM_ASSETS.find((item) => item.symbol === symbol);
  return asset ?? { ...UNKNOWN_ROOM_ASSET, symbol: symbol ?? '' };
}

export function assetUnit(symbol) {
  return findRoomAsset(symbol).unit;
}

export function assetUnitShort(symbol) {
  return findRoomAsset(symbol).unitShort;
}

export function assetDecimals(symbol) {
  return findRoomAsset(symbol).decimals;
}

export function assetQtyDecimals(symbol) {
  return findRoomAsset(symbol).qtyDecimals ?? 2;
}

/** Prix formaté avec le nombre de décimales propre à l'actif. */
export function formatPrice(value, symbol) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '—';
  return num.toLocaleString('fr-FR', {
    minimumFractionDigits: assetDecimals(symbol),
    maximumFractionDigits: assetDecimals(symbol),
  });
}

// Sources de données marché proposées au Meneur de Jeu.
export const SOURCE_MODES = [
  {
    value: 'scenario',
    label: 'Scénario pédagogique',
    hint: 'Rejoue « Le mardi de la panique » : séquence de prix, chocs et spread écrits à l’avance.',
  },
  {
    value: 'synthetic',
    label: 'Marché synthétique',
    hint: 'Génère une courbe à partir d’un prix initial, d’une volatilité, d’une tendance et d’événements planifiés.',
  },
  {
    value: 'historical',
    label: 'Données historiques',
    hint: 'Rejoue les ticks enregistrés en base sur une fenêtre de 5 min, 1 h ou 24 h.',
  },
  {
    value: 'csv',
    label: 'Historique CSV (import)',
    hint: 'Importez vos propres bougies OHLC : le fichier est validé puis rejoué à la vitesse choisie.',
  },
  {
    value: 'live',
    label: 'Marché en direct',
    hint: 'Suit les cotations réelles (Binance / Finnhub). Vitesse imposée à 1x, horodatage réel.',
  },
];

export const DURATION_CHOICES = [1, 5, 10, 15, 30];

export const TIMEFRAME_CHOICES = ['1m', '5m', '15m', '30m', '1h'];

export const HISTORY_RANGE_CHOICES = [
  { value: '5m', label: '5 dernières minutes' },
  { value: '1h', label: '1 dernière heure' },
  { value: '24h', label: '24 dernières heures' },
];
