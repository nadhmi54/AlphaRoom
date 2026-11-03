export interface MarketAsset {
  symbol: string;
  name: string;
  unit: string;
  category: 'commodity' | 'forex' | 'crypto' | 'stock';
  currency: 'USD';
  price: number;
  source: 'demo-fixed-price';
}

// Prices are intentionally fixed demo values. They are not live market data.
export const MARKET_ASSETS: readonly MarketAsset[] = [
  { symbol: 'XAU/USD', name: 'Or', unit: 'once troy (oz)', category: 'commodity', currency: 'USD', price: 2685.4, source: 'demo-fixed-price' },
  { symbol: 'EUR/USD', name: 'Euro/Dollar', unit: 'EUR', category: 'forex', currency: 'USD', price: 1.0834, source: 'demo-fixed-price' },
  { symbol: 'BTC/USD', name: 'Bitcoin', unit: 'BTC', category: 'crypto', currency: 'USD', price: 67500, source: 'demo-fixed-price' },
  { symbol: 'AAPL', name: 'Apple', unit: 'action', category: 'stock', currency: 'USD', price: 224.5, source: 'demo-fixed-price' },
];

export function findMarketAsset(symbol: string) {
// ── Registre global des actifs négociables (démarre avec MARKET_ASSETS) ─────────
export const TRADABLE_ASSETS: MarketAsset[] = [];

// ── Cache mémoire (pour éviter les recherches linéaires) ─────────────────────────
const knownAssets = new Map<string, MarketAsset>();
const uppercaseToSymbol = new Map<string, string>();

// ── Initialisation (appelé une fois, au démarrage) ─────────────────────────────
export function registerMarketAssets(assets: MarketAsset[]) {
  for (const asset of assets) {
    knownAssets.set(asset.symbol, asset);
    uppercaseToSymbol.set(asset.symbol.toUpperCase(), asset.symbol);
  }
  // Compléter avec les actifs natifs s'ils n'étaient pas ajoutés.
  for (const native of MARKET_ASSETS) {
    if (!knownAssets.has(native.symbol)) {
      knownAssets.set(native.symbol, native);
      uppercaseToSymbol.set(native.symbol.toUpperCase(), native.symbol);
    }
  }
}

// ── Recherche par symbole (casse insensible, préfixe supporté) ─────────────────
export function findMarketAsset(symbol: string): MarketAsset | undefined {
  if (!symbol) return undefined;
  const normalized = symbol.trim().toUpperCase();
  if (uppercaseToSymbol.has(normalized)) {
    return knownAssets.get(uppercaseToSymbol.get(normalized)!);
  }
  // Recherche par préfixe (ex. "ETH" → "ETH/USDT")
  for (const [storedSymbol, asset] of knownAssets) {
    const storedWithoutSlash = storedSymbol.replace('/', '').replace('_', '');
    const normalizedWithoutSlash = normalized.replace('/', '').replace('_', '');
    if (storedWithoutSlash.startsWith(normalizedWithoutSlash) ||
        normalizedWithoutSlash.startsWith(storedWithoutSlash)) {
      return asset;
    }
  }
  return knownAssets.get(normalized);
}

// ── Export par défaut pour la compatibilité ─────────────────────────────────────
export default MARKET_ASSETS;
