import { describe, expect, it } from 'vitest';
import {
  MARKET_ASSETS,
  TRADABLE_ASSETS,
  findMarketAsset,
  normalizeSymbol,
  resolveMarketAsset,
  toBinanceSymbol,
} from './market-assets.js';

describe('market-assets — registre et normalisation', () => {
  it('les actifs natifs exposent bien un champ source', () => {
    expect(MARKET_ASSETS).toHaveLength(4);
    expect(MARKET_ASSETS.every((asset) => typeof asset.source === 'string')).toBe(true);
    expect(TRADABLE_ASSETS.every((asset) => typeof asset.source === 'string')).toBe(true);
  });

  it('normalise les deux écritures d’une paire Binance', () => {
    expect(normalizeSymbol('BNBUSDT')).toBe('BNB/USDT');
    expect(normalizeSymbol('bnb_usdt')).toBe('BNB/USDT');
    expect(normalizeSymbol('ETH/USDT')).toBe('ETH/USDT');
    expect(normalizeSymbol('XAUUSD')).toBe('XAU/USD');
    expect(normalizeSymbol('AAPL')).toBe('AAPL');
    expect(toBinanceSymbol('BNB/USDT')).toBe('BNBUSDT');
  });

  it('trouve les actifs natifs sans tenir compte de la casse', () => {
    expect(findMarketAsset('xau/usd')?.symbol).toBe('XAU/USD');
    expect(findMarketAsset('aapl')?.symbol).toBe('AAPL');
  });

  it('un actif inconnu n’hérite jamais du prix d’un autre actif', () => {
    expect(findMarketAsset('ZZZ/USDT')).toBeUndefined();
    const unknown = resolveMarketAsset('ZZZ/USDT');
    expect(unknown.symbol).toBe('ZZZ/USDT');
    expect(unknown.price).toBe(0);
    expect(unknown.source).toBe('unpriced');
    expect(unknown.category).toBe('crypto');
  });

  it('un actif natif conserve son prix de démonstration', () => {
    const gold = resolveMarketAsset('XAU/USD');
    expect(gold.price).toBeGreaterThan(0);
    expect(gold.source).toBe('demo-fixed-price');
  });
});
