import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Auth } from '../../../users/auth.decorator.js';
import { CurrentProfile } from '../../../users/current-profile.decorator.js';
import { Profile } from '../../../users/profile.entity.js';
import { MarketTransactionsService } from './market-transactions.service.js';
import { TransactionsQueryDto } from './dto/transactions-query.dto.js';

@Auth()
@Controller('market/transactions')
export class MarketTransactionsController {
  constructor(private readonly transactions: MarketTransactionsService) {}

  @Get()
  getTransactions(
    @CurrentProfile() profile: Profile,
    @Query() filters: TransactionsQueryDto,
  ) {
    return this.transactions.getTransactions(profile.id, filters);
  }

  @Get('export.csv')
  async exportCsv(
    @CurrentProfile() profile: Profile,
    @Query() filters: TransactionsQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.transactions.exportCsv(profile.id, filters);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=transactions_marche.csv');
    return res.send(csv);
  }
}
