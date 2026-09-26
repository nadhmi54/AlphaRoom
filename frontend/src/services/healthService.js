import { API_URL } from '../config/env.js';

// Interroge GET /api/health sur le backend et renvoie son statut
// ("ok", "unreachable"...). Centralise l'appel réseau plutôt que de le
// faire directement dans un composant de page.
export async function fetchHealthStatus() {
  try {
    const res = await fetch(`${API_URL}/health`);
    const data = await res.json();
    return data.status;
  } catch {
    return 'unreachable';
  }
}
