import { apiFetch } from "./apiClient.js";

export const getTradingAssets = () => apiFetch("/trading/assets");
export const getTradingQuote = (symbol) =>
  apiFetch("/trading/quote", { query: symbol ? { symbol } : undefined });
export const getTradingPortfolio = (filters) =>
  apiFetch("/trading/portfolio", { query: filters });
export const placeMarketOrder = (order) =>
  apiFetch("/trading/orders/market", { method: "POST", body: order });
