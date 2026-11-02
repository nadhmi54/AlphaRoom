import { Controller, Sse, Header, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { QuotesGuard } from './quotes.guard.js';
import { QuotesService } from './quotes.service.js';

@Controller('market')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @UseGuards(QuotesGuard)
  @Sse('stream')
  @Header('X-Accel-Buffering', 'no')
  stream(): Observable<any> {
    return this.quotesService.getQuotesStream();
  }
}
