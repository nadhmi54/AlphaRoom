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
  return MARKET_ASSETS.find((asset) => asset.symbol === symbol);
}
