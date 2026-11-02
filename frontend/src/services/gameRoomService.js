import { apiFetch } from './apiClient.js';

export async function getDemoRoom() {
  return apiFetch('/game-room/demo');
}

// Salles créées par le Meneur de Jeu connecté.
export async function getMyRooms() {
  return apiFetch('/game-room/mine');
}

// payload : { name, scenarioId?, config?, source?, time? }
export async function createGameRoom(payload) {
  return apiFetch('/game-room/create', {
    method: 'POST',
    body: payload,
  });
}

// Validation serveur d'un CSV de bougies avant création de la salle.
export async function previewCsv(content, filename) {
  return apiFetch('/game-room/preview-csv', {
    method: 'POST',
    body: { content, filename },
  });
}

export async function updateRoomConfig(roomId, payload) {
  return apiFetch(`/game-room/${roomId}/config`, {
    method: 'PATCH',
    body: payload,
  });
}

export async function setRoomSpeed(roomId, speed) {
  return apiFetch(`/game-room/${roomId}/speed`, {
    method: 'POST',
    body: { speed },
  });
}

export async function seekRoom(roomId, seconds) {
  return apiFetch(`/game-room/${roomId}/seek`, {
    method: 'POST',
    body: { seconds },
  });
}

export async function getRoomCandles(roomId, symbol, timeframe) {
  return apiFetch(`/game-room/${roomId}/candles`, { query: { symbol, timeframe } });
}

export async function joinGameRoom(codeOrId, nickname) {
  return apiFetch('/game-room/join', {
    method: 'POST',
    body: { codeOrId, nickname },
  });
}

export async function getGameRoomDetails(roomId, symbol) {
  return apiFetch(`/game-room/${roomId}`, { query: { symbol } });
}

export async function getGameRoomPortfolio(roomId) {
  return apiFetch(`/game-room/${roomId}/portfolio`);
}

export async function placeSimOrder(roomId, orderData) {
  return apiFetch(`/game-room/${roomId}/order`, {
    method: 'POST',
    body: orderData,
  });
}

export async function closeSimPosition(roomId, symbol) {
  return apiFetch(`/game-room/${roomId}/close-position`, {
    method: 'POST',
    body: { symbol },
  });
}

export async function controlGameRoom(roomId, action) {
  return apiFetch(`/game-room/${roomId}/control`, {
    method: 'POST',
    body: { action },
  });
}

export async function triggerGameMasterAction(roomId, actionData) {
  return apiFetch(`/game-room/${roomId}/action`, {
    method: 'POST',
    body: actionData,
  });
}

export async function getGameRoomDashboard(roomId) {
  return apiFetch(`/game-room/${roomId}/dashboard`);
}

export async function getAiMarketAnalysis(roomId) {
  return apiFetch(`/game-room/${roomId}/ai/analyst`);
}

export async function askAiTradingCoach(roomId, question) {
  return apiFetch(`/game-room/${roomId}/ai/coach`, {
    method: 'POST',
    body: { question },
  });
}

export async function getAiPerformanceEval(roomId) {
  return apiFetch(`/game-room/${roomId}/ai/eval`);
}
