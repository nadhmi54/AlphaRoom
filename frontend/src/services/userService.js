import { apiFetch } from './apiClient.js';

// --- Profil de l'utilisateur connecté ---
export const getMe = () => apiFetch('/users/me');
export const updateMe = (changes) => apiFetch('/users/me', { method: 'PATCH', body: changes });

// --- Administration (rôle admin requis côté backend) ---
export const listUsers = (query) => apiFetch('/admin/users', { query });
export const changeUserRole = (id, role) =>
  apiFetch(`/admin/users/${id}/role`, { method: 'PATCH', body: { role } });
export const setUserActive = (id, isActive) =>
  apiFetch(`/admin/users/${id}/status`, { method: 'PATCH', body: { isActive } });
export const listAuditLogs = (query) => apiFetch('/admin/audit-logs', { query });
