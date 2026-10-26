import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import type { TradingService } from '../trading/trading.service.js';
import { OrderBookService } from './order-book.service.js';

describe('OrderBookService protections', () => {
  it('ferme la position quand le cours atteint son stop-loss', async () => {
    const query = vi.fn(async () => [
      { ownerId: 'user-stop', quantity: '2.000000', stopLoss: '90.0000', takeProfit: null },
    ]);
    const service = new OrderBookService({ query } as unknown as DataSource, {} as TradingService);
    const close = vi.spyOn(service, 'closePosition').mockResolvedValue({} as never);

    await service.checkProtections('AAPL', 90);

    expect(close).toHaveBeenCalledWith('user-stop', 'AAPL', expect.any(String));
  });

  it('ferme la position quand le cours atteint son take-profit', async () => {
    const query = vi.fn(async () => [
      { ownerId: 'user-profit', quantity: '2.000000', stopLoss: null, takeProfit: '120.0000' },
    ]);
    const service = new OrderBookService({ query } as unknown as DataSource, {} as TradingService);
    const close = vi.spyOn(service, 'closePosition').mockResolvedValue({} as never);

    await service.checkProtections('AAPL', 120);

    expect(close).toHaveBeenCalledWith('user-profit', 'AAPL', expect.any(String));
  });

  it('ne déclenche pas de fermeture si la requête ne trouve aucun seuil atteint', async () => {
    const query = vi.fn(async () => []);
    const service = new OrderBookService({ query } as unknown as DataSource, {} as TradingService);
    const close = vi.spyOn(service, 'closePosition').mockResolvedValue({} as never);

    await service.checkProtections('AAPL', 100);

    expect(close).not.toHaveBeenCalled();
  });
});
