import { Injectable, Logger } from '@nestjs/common';
import { interval, map, Observable } from 'rxjs';
import { MarketDataService } from '../../market-data/market-data.service.js';
import { MarketMakerService } from '../market-maker/market-maker.service.js';

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    private readonly marketData: MarketDataService,
    private readonly maker: MarketMakerService,
  ) {}

  getQuotesStream(): Observable<any> {
    // On émet les cotations toutes les secondes (cadence paramétrable)
    return interval(1000).pipe(
      map(() => {
        const quotes = this.marketData.quotes().map((q) => {
          const makerQuote = this.maker.calculateQuote(q.price);
          return {
            ...q,
            bid: makerQuote?.bid ?? null,
            ask: makerQuote?.ask ?? null,
            mid: makerQuote?.mid ?? q.price,
          };
        });

        return { data: { quotes, ts: new Date().toISOString() } };
      }),
    );
  }
}
