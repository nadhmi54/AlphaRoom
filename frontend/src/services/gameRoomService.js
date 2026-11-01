import { apiFetch } from './apiClient.js';

export async function getDemoRoom() {
  return apiFetch('/game-room/demo');
}

export async function createGameRoom(name, scenarioId = 'panic_tuesday') {
  return apiFetch('/game-room/create', {
    method: 'POST',
    body: { name, scenarioId },
  });
}

export async function joinGameRoom(codeOrId, nickname) {
  return apiFetch('/game-room/join', {
    method: 'POST',
    body: { codeOrId, nickname },
  });
}

export async function getGameRoomDetails(roomId) {
  return apiFetch(`/game-room/${roomId}`);
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

export async function closeSimPosition(roomId, symbol = 'XAU/USD') {
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
