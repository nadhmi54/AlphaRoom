export type AssetCategory = 'commodity' | 'forex' | 'crypto' | 'stock';

/**
 * Origine du prix porté par l'actif.
 * - `demo-fixed-price` : valeur de démonstration fixe (les 4 actifs natifs).
 * - `live`             : prix réel (Binance REST, flux temps réel…).
 * - `unpriced`         : aucun prix connu pour l'instant (actif découvert à la
 *                        volée) : `price` vaut 0 et ne doit **jamais** servir
 *                        au trading tant qu'un prix réel n'a pas été obtenu.
 */
export type AssetSource = 'demo-fixed-price' | 'live' | 'unpriced';

export interface MarketAsset {
  symbol: string;
  name: string;
  unit: string;
  category: AssetCategory;
  currency: 'USD';
  price: number;
  source: AssetSource;
}

// Prix volontairement fixes : ce sont des valeurs de démonstration, pas des
// cotations réelles. Les actifs découverts via la recherche Binance utilisent
// un prix réel obtenu par l'API REST (voir OrderBookService.ensureLiquidity).
export const MARKET_ASSETS: readonly MarketAsset[] = [
  { symbol: 'XAU/USD', name: 'Or', unit: 'once troy (oz)', category: 'commodity', currency: 'USD', price: 2685.4, source: 'demo-fixed-price' },
  { symbol: 'EUR/USD', name: 'Euro/Dollar', unit: 'EUR', category: 'forex', currency: 'USD', price: 1.0834, source: 'demo-fixed-price' },
  { symbol: 'BTC/USD', name: 'Bitcoin', unit: 'BTC', category: 'crypto', currency: 'USD', price: 67500, source: 'demo-fixed-price' },
  { symbol: 'AAPL', name: 'Apple', unit: 'action', category: 'stock', currency: 'USD', price: 224.5, source: 'demo-fixed-price' },
];

// ── Registre global des actifs négociables (démarre avec MARKET_ASSETS) ─────────
export const TRADABLE_ASSETS: MarketAsset[] = [...MARKET_ASSETS];

/** Devises de cotation reconnues pour normaliser `BNBUSDT` en `BNB/USDT`. */
const QUOTE_CURRENCIES = [
  'FDUSD',
  'USDT',
  'USDC',
  'BUSD',
  'TUSD',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'BTC',
  'ETH',
  'BNB',
] as const;

/** Devises fiat : une paire qui les utilise est du Forex, pas de la crypto. */
const FIAT_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD']);

/**
 * Normalise un symbole pour que les deux écritures d'une même paire désignent
 * le même actif :
 *   `bnbUsdt` → `BNB/USDT`, `BNB/USDT` → `BNB/USDT`, `bnb_usdt` → `BNB/USDT`.
 * Les symboles sans devise de cotation connue (ex. `AAPL`) sont seulement mis
 * en majuscules.
 */
export function normalizeSymbol(symbol: string): string {
  const trimmed = (symbol ?? '').trim().toUpperCase().replace(/[_\-\s]/g, '');
  if (!trimmed) return '';
  if (trimmed.includes('/')) return trimmed;

  for (const quote of QUOTE_CURRENCIES) {
    if (trimmed.length <= quote.length) continue;
    if (!trimmed.endsWith(quote)) continue;
    const base = trimmed.slice(0, -quote.length);
    // Une base entièrement numérique n'est pas un actif : on laisse tel quel.
    if (!base || /^\d+$/.test(base)) continue;
    return `${base}/${quote}`;
  }
  return trimmed;
}

/** Clé de comparaison insensible aux séparateurs (`BNB/USDT` = `BNBUSDT`). */
function symbolKey(symbol: string): string {
  return normalizeSymbol(symbol).replace(/[^A-Z0-9]/g, '');
}

const knownAssets = new Map<string, MarketAsset>();

function remember(asset: MarketAsset) {
  const symbol = normalizeSymbol(asset.symbol);
  if (!symbol) return;
  const normalized: MarketAsset = { ...asset, symbol };
  knownAssets.set(symbolKey(symbol), normalized);
  const index = TRADABLE_ASSETS.findIndex(
    (candidate) => symbolKey(candidate.symbol) === symbolKey(symbol),
  );
  if (index >= 0) TRADABLE_ASSETS[index] = normalized;
  else TRADABLE_ASSETS.push(normalized);
}

// Les 4 actifs natifs sont toujours connus.
for (const asset of MARKET_ASSETS) remember(asset);

/** Tous les actifs actuellement négociables (natifs + actifs découverts). */
export function tradableAssets(): readonly MarketAsset[] {
  return TRADABLE_ASSETS;
}

/**
 * Recherche un actif **enregistré**. Retourne `undefined` pour une paire
 * inconnue : c'est ce qui permet à `/market/history` de basculer sur Binance
 * REST pour une paire arbitraire.
 */
export function findMarketAsset(symbol: string): MarketAsset | undefined {
  if (!symbol) return undefined;
  return knownAssets.get(symbolKey(symbol));
}

/** Devine les métadonnées d'une paire non enregistrée, sans inventer de prix. */
function syntheticAsset(symbol: string): MarketAsset {
  const [base, quote] = symbol.split('/');
  if (!quote) {
    return {
      symbol,
      name: symbol,
      unit: 'unités',
      category: 'stock',
      currency: 'USD',
      price: 0,
      source: 'unpriced',
    };
  }

  const category: AssetCategory = FIAT_CURRENCIES.has(quote) ? 'forex' : 'crypto';
  return {
    symbol,
    name: base,
    unit: base,
    category,
    currency: 'USD',
    price: 0,
    source: 'unpriced',
  };
}

/**
 * Résout un actif pour le carnet : ne lève **jamais** d'exception, même pour un
 * symbole inconnu. Un actif inconnu obtient `price: 0` / `source: 'unpriced'`,
 * et le carnet demandera alors un vrai prix (Binance REST puis base) avant de
 * refuser l'ordre avec un message français explicite.
 */
export function resolveMarketAsset(symbol: string): MarketAsset {
  const normalized = normalizeSymbol(symbol);
  const known = findMarketAsset(normalized);
  if (known) return known;
  return syntheticAsset(normalized || symbol.trim().toUpperCase());
}

/** Symbole Binance brut (`BNB/USDT` → `BNBUSDT`). */
export function toBinanceSymbol(symbol: string): string {
  return symbolKey(symbol);
}
