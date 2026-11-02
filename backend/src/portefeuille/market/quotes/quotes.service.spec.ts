import { describe, it, expect, vi } from 'vitest';
import { QuotesService } from './quotes.service.js';

describe('QuotesService', () => {
  it('combine les prix du marché avec les cotations du bot', async () => {
    const mockMarketData = {
      quotes: vi.fn().mockReturnValue([
        { symbol: 'BTC/USD', price: 50000, changePercent: 1 }
      ])
    };
    
    const mockMaker = {
      calculateQuote: vi.fn().mockReturnValue({ bid: 49950, ask: 50050, mid: 50000 })
    };

    const service = new QuotesService(mockMarketData as any, mockMaker as any);
    const stream = service.getQuotesStream();

    // On prend la première émission
    const result = await new Promise<any>((resolve) => {
      const sub = stream.subscribe((val) => {
        resolve(val);
        sub.unsubscribe();
      });
    });

    expect(result.data.quotes[0].symbol).toBe('BTC/USD');
    expect(result.data.quotes[0].bid).toBe(49950);
    expect(result.data.quotes[0].ask).toBe(50050);
  });
});
