export type ProtectionTrigger = 'stop_loss' | 'take_profit' | null;

export function getProtectionTrigger(
  price: number,
  protection: { stopLoss: number | null; takeProfit: number | null },
): ProtectionTrigger {
  if (!Number.isFinite(price) || price <= 0) return null;
  if (protection.stopLoss !== null && price <= protection.stopLoss) return 'stop_loss';
  if (protection.takeProfit !== null && price >= protection.takeProfit) return 'take_profit';
  return null;
}
