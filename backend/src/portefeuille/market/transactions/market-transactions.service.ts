import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TransactionsQueryDto } from './dto/transactions-query.dto.js';
import { generateCsv } from './csv.js';
import type { MarketTransaction } from './market-transaction.js';

// Le tri est exposé à l'API avec des noms « métier » (executedAt) mais la
// colonne SQL s'appelle executed_at : sans cette table, l'ORDER BY échoue.
const SORT_COLUMNS: Record<string, string> = {
  executedAt: 'executed_at',
  amount: 'amount',
  quantity: 'quantity',
  price: 'price',
};

@Injectable()
export class MarketTransactionsService {
  constructor(private readonly dataSource: DataSource) {}

  async getTransactions(ownerId: string, filters: TransactionsQueryDto) {
    const { query, params } = this.buildBaseQuery(ownerId, filters);
    const orderBy = this.buildOrderBy(filters);

    // Pagination
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const countQuery = `SELECT COUNT(*) FROM (${query}) as subquery`;
    const dataQuery = `${query} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const totalResult = await this.dataSource.query(countQuery, params);
    const total = parseInt(totalResult[0].count, 10);

    const rows = await this.dataSource.query(dataQuery, [...params, limit, offset]);

    return {
      transactions: rows.map((row: any) => this.mapRow(row)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async exportCsv(ownerId: string, filters: TransactionsQueryDto): Promise<string> {
    const { query, params } = this.buildBaseQuery(ownerId, filters);
    const rows = await this.dataSource.query(`${query} ${this.buildOrderBy(filters)}`, params);

    const transactions: MarketTransaction[] = rows.map((row: any) => this.mapRow(row));
    const headers = ['Date', 'Actif', 'Sens', 'Quantité', 'Prix', 'Montant', 'Statut'];
    const data = transactions.map((t) => [
      t.executedAt,
      t.symbol,
      t.side === 'buy' ? 'Achat' : 'Vente',
      t.quantity,
      t.price,
      t.amount,
      t.status,
    ]);

    return generateCsv(headers, data);
  }

  // `sort` et `order` sont validés par le DTO (@IsIn) : la colonne est
  // résolue via SORT_COLUMNS, jamais interpolée telle quelle.
  private buildOrderBy(filters: TransactionsQueryDto): string {
    const column = SORT_COLUMNS[filters.sort] ?? 'executed_at';
    const direction = filters.order === 'ASC' ? 'ASC' : 'DESC';
    return `ORDER BY ${column} ${direction}`;
  }

  private buildBaseQuery(ownerId: string, filters: TransactionsQueryDto) {
    let query = `SELECT * FROM public.trade_executions WHERE owner_id = $1`;
    const params: any[] = [ownerId];
    let pIdx = 2;

    if (filters.symbol) {
      query += ` AND symbol = $${pIdx++}`;
      params.push(filters.symbol);
    }
    if (filters.side) {
      query += ` AND side = $${pIdx++}`;
      params.push(filters.side);
    }
    if (filters.from !== undefined) {
      query += ` AND executed_at >= $${pIdx++}`;
      params.push(filters.from);
    }
    if (filters.to !== undefined) {
      query += ` AND executed_at <= $${pIdx++}`;
      params.push(filters.to);
    }
    if (filters.minAmount !== undefined) {
      query += ` AND amount >= $${pIdx++}`;
      params.push(filters.minAmount);
    }
    if (filters.maxAmount !== undefined) {
      query += ` AND amount <= $${pIdx++}`;
      params.push(filters.maxAmount);
    }

    return { query, params };
  }

  private mapRow(row: any): MarketTransaction {
    return {
      id: row.id,
      symbol: row.symbol,
      side: row.side,
      quantity: parseFloat(row.quantity),
      price: parseFloat(row.price),
      amount: parseFloat(row.amount),
      executedAt: new Date(row.executed_at).toISOString(),
      status: 'executed',
    };
  }
}
