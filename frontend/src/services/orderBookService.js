import { apiFetch } from "./apiClient.js";

// Carnet d'ordres de M1 : photo du carnet, ordres du compte, passage et
// annulation. Le carnet est global par actif (tous les comptes s'apparient
// contre le même carnet, sans auto-appariement).
export const getOrderBook = (symbol, depth = 12) =>
  apiFetch("/orders/book", { query: { symbol, depth } });

export const getMyOrders = (status) =>
  apiFetch("/orders", { query: status ? { status } : undefined });

export const placeBookOrder = (order) =>
  apiFetch("/orders", { method: "POST", body: order });

export const cancelBookOrder = (orderId) =>
  apiFetch(`/orders/${orderId}`, { method: "DELETE" });
