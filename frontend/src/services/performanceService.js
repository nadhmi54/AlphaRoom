import { apiFetch } from "./apiClient.js";

// Module M3 — Performance & risque (lecture seule).
// L'identifiant attendu est celui du portefeuille (account.portfolio.id),
// pas celui du profil : le backend vérifie que le portefeuille appartient
// bien à l'utilisateur du JWT.
export const getPerformance = (portfolioId) =>
  apiFetch(`/portfolios/${portfolioId}/performance`);

export const getPerformanceHistory = (portfolioId, { page = 1, limit = 90 } = {}) =>
  apiFetch(`/portfolios/${portfolioId}/performance/history`, { query: { page, limit } });
