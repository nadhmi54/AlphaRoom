import { API_URL } from '../config/env.js';
import { supabase } from '../config/supabaseClient.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function accessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Appel JSON vers le backend NestJS. Ajoute automatiquement
// "Authorization: Bearer <access_token Supabase>" quand une session existe
// (le backend vérifie ce JWT) et convertit les erreurs HTTP en ApiError avec
// un message lisible (le backend renvoie { message: string | string[] }).
export async function apiFetch(path, { method = 'GET', body, query } = {}) {
  const headers = { Accept: 'application/json' };
  const token = await accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let url = `${API_URL}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Serveur injoignable. Vérifie que le backend est démarré.');
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(' ') : data?.message;
    throw new ApiError(response.status, message || `Erreur ${response.status}`);
  }
  return data;
}
