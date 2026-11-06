import { apiFetch } from "./apiClient.js";

// Prix en temps réel : dernier prix de chaque actif + mini-courbe.
export const getQuotes = () => apiFetch("/market/quotes");

// Courbe d'un actif. range : "5m" | "1h" | "24h".
// Fonctionne pour les 4 actifs natifs ET les paires Binance arbitraires (ex. ETHUSDT).
export const getHistory = (symbol, range = "5m") =>
  apiFetch("/market/history", { query: { symbol, range } });

// Recherche d'actifs dans un marché : "crypto" (Binance) ou
// "stock" | "commodity" | "forex" (catalogue local côté backend).
export const searchSymbols = (q, market = "crypto") =>
  apiFetch("/market/search", { query: { q, market } });

// Prix spot en temps réel d'une paire Binance arbitraire (ex. ETHUSDT).
export const getSpotPrice = (symbol) =>
  apiFetch("/market/spot", { query: { symbol } });
