// Actifs négociables d'une Game Room.
// Miroir de backend/src/portefeuille/trading/market-assets.ts : le Meneur de
// Jeu n'a pas accès au module /market-data (réservé aux rôles de trading), la
// liste est donc embarquée côté front. `price` sert uniquement de valeur
// suggérée pour le prix initial d'un marché synthétique.
export const ROOM_ASSETS = [
  { symbol: 'XAU/USD', name: 'Or', unit: 'once troy (oz)', unitShort: 'oz', category: 'Matières premières', price: 2685.4, decimals: 2, qtyDecimals: 3 },
  { symbol: 'EUR/USD', name: 'Euro/Dollar', unit: 'EUR', unitShort: 'EUR', category: 'Forex', price: 1.0834, decimals: 4, qtyDecimals: 2 },
  { symbol: 'BTC/USD', name: 'Bitcoin', unit: 'BTC', unitShort: 'BTC', category: 'Crypto', price: 67500, decimals: 2, qtyDecimals: 6 },
  { symbol: 'AAPL', name: 'Apple', unit: 'action', unitShort: 'act.', category: 'Actions', price: 224.5, decimals: 2, qtyDecimals: 2 },
];

export function findRoomAsset(symbol) {
  return ROOM_ASSETS.find((asset) => asset.symbol === symbol) || ROOM_ASSETS[0];
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
  if (!Number.isFinite(num)) return '—';
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
