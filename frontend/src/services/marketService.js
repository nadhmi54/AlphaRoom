import { apiFetch } from "./apiClient.js";

// Prix en temps réel : dernier prix de chaque actif + mini-courbe.
export const getQuotes = () => apiFetch("/market/quotes");

// Courbe d'un actif. range : "5m" | "1h" | "24h".
export const getHistory = (symbol, range = "5m") =>
  apiFetch("/market/history", { query: { symbol, range } });
