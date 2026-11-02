export interface MarketTransaction {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  amount: number;
  executedAt: string;
  status: string;
}
