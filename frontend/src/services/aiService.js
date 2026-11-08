import { apiFetch, apiStream } from './apiClient.js';

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

// Même question, mais la réponse arrive en direct : onEvent reçoit tool / delta / reset / done / error.
export const streamCoach = (payload, { onEvent, signal } = {}) =>
  apiStream('/ai/coach/stream', { body: payload, signal, onEvent: onEvent ?? (() => {}) });

// Discussions du coach : plusieurs en parallèle, gardées côté serveur (le coach s'en souvient).
export const listConversations = () => apiFetch('/ai/conversations');

export const getConversation = (id) => apiFetch(`/ai/conversations/${id}`);

export const renameConversation = (id, title) => apiFetch(`/ai/conversations/${id}`, { method: 'PATCH', body: { title } });

export const deleteConversation = (id) => apiFetch(`/ai/conversations/${id}`, { method: 'DELETE' });

export const analyzeMarket = (sessionId, run) =>
  apiFetch('/ai/analysis/market', { method: 'POST', body: { sessionId, run } });

export const analyzeReplay = (sessionId, fromRun, toRun) =>
  apiFetch('/ai/analysis/replay', { method: 'POST', body: { sessionId, fromRun, toRun } });

// Guide du trader : alertes en cours de séance, briefing de début, bilan, suivi de la classe.
export const getGuideAlerts = (target = {}) => apiFetch('/ai/guide/alerts', { query: target });

export const getGuideBriefing = (target = {}) => apiFetch('/ai/guide/briefing', { query: target });

export const getGuideDebrief = (target = {}) => apiFetch('/ai/guide/debrief', { method: 'POST', body: target });

export const getLiveClass = (target = {}) => apiFetch('/ai/guide/live', { query: target });
