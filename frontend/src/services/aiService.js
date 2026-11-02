import { apiFetch } from './apiClient.js';

// Module IA : séances, bilans (enseignant / étudiant), coach, analyses.
// Les droits sont contrôlés côté backend ; ici, ce sont de simples appels.

export const listAiSessions = () => apiFetch('/ai/sessions');

export const generateReports = (sessionId, run, participantId) =>
  apiFetch('/ai/reports/generate', {
    method: 'POST',
    body: { sessionId, run, ...(participantId ? { participantId } : {}) },
  });

export const listReports = (sessionId, run) => apiFetch('/ai/reports', { query: { sessionId, run } });

export const getReport = (id) => apiFetch(`/ai/reports/${id}`);

export const editReport = (id, changes) => apiFetch(`/ai/reports/${id}`, { method: 'PATCH', body: changes });

export const validateReport = (id, publish) =>
  apiFetch(`/ai/reports/${id}/validate`, { method: 'POST', body: { publish } });

export const getAiUsage = (sessionId) => apiFetch('/ai/reports/usage', { query: { sessionId } });

export const askCoach = (payload) => apiFetch('/ai/coach/ask', { method: 'POST', body: payload });

export const analyzeMarket = (sessionId, run) =>
  apiFetch('/ai/analysis/market', { method: 'POST', body: { sessionId, run } });

export const analyzeReplay = (sessionId, fromRun, toRun) =>
  apiFetch('/ai/analysis/replay', { method: 'POST', body: { sessionId, fromRun, toRun } });
