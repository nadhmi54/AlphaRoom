import { apiFetch } from "./apiClient.js";

// Module M2 — Positions & répartition (lecture seule).
// status : "open" | "closed" | "all"
export const getPositions = (status = "all") =>
  apiFetch("/portfolio/positions", { query: { status } });

export const getAllocation = () => apiFetch("/portfolio/allocation");
