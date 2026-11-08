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

// Appel qui reçoit sa réponse en direct (server-sent events) : chaque événement `data: {...}`
// est transmis à `onEvent` dès son arrivée. Sert au coach pour écrire la réponse mot à mot.
export async function apiStream(path, { body, signal, onEvent }) {
  const headers = { Accept: 'text/event-stream', 'Content-Type': 'application/json' };
  const token = await accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body ?? {}), signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError(0, 'Serveur injoignable. Vérifie que le backend est démarré.');
  }
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => null);
    const message = Array.isArray(data?.message) ? data.message.join(' ') : data?.message;
    throw new ApiError(response.status, message || `Erreur ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const flush = (line) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data) return;
    try {
      onEvent(JSON.parse(data));
    } catch {
      // Un morceau illisible est ignoré : le flux continue.
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      flush(buffer.slice(0, newline).replace(/\r$/, ''));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  if (buffer.trim()) flush(buffer.trim());
}
