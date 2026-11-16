// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import GameRoomPage from './GameRoomPage.jsx';
import { getGameRoomDetails } from '../../services/gameRoomService.js';

vi.mock('../../context/useAuth.js', () => ({
  useAuth: vi.fn(() => ({
    profile: { id: 'test-user-id', role: 'trader', fullName: 'Étudiant Test' },
    session: { user: { id: 'test-user-id' } },
  })),
}));

const { DEMO_ROOM_DETAILS } = vi.hoisted(() => ({
  DEMO_ROOM_DETAILS: {
    room: {
      id: 'demo-room-1',
      name: 'Le mardi de la panique — Séance principale',
      joinCode: 'PANIC1',
      status: 'running',
      scenarioId: 'panic_tuesday',
      scenarioName: 'Le mardi de la panique',
      simElapsedSeconds: 660,
      currentMinute: 11.0,
      totalMinutes: 30,
      isMaster: false,
    },
    market: {
      symbol: 'XAU/USD',
      price: 2693.0,
      spread: 0.35,
      series: [
        { t: 0, price: 2700 },
        { t: 600, price: 2699 },
        { t: 660, price: 2693 },
      ],
    },
    book: {
      symbol: 'XAU/USD',
      lastPrice: 2693.0,
      bestBid: 2692.8,
      bestAsk: 2693.2,
      spread: 0.4,
      bids: [{ price: 2692.8, quantity: 15, orders: 3 }],
      asks: [{ price: 2693.2, quantity: 15, orders: 3 }],
      simMinute: 11.0,
    },
    participantsCount: 3,
    participants: [
      { id: 'p1', userId: 'u1', nickname: 'Alexandre', isActive: true },
    ],
    recentEvents: [],
  },
}));

vi.mock('../../services/gameRoomService.js', () => ({
  getGameRoomDetails: vi.fn().mockImplementation((roomId) =>
    Promise.resolve({
      ...DEMO_ROOM_DETAILS,
      room: {
        ...DEMO_ROOM_DETAILS.room,
        id: roomId || 'demo-room-1',
        name: roomId === 'custom-room-42' ? 'Salle Personnalisée de Finance' : DEMO_ROOM_DETAILS.room.name,
        scenarioName: roomId === 'custom-room-42' ? 'Salle Personnalisée de Finance' : DEMO_ROOM_DETAILS.room.scenarioName,
      },
    }),
  ),
  joinGameRoom: vi.fn().mockResolvedValue({ room: { id: 'room-1' }, participant: {}, portfolio: {} }),
  getMyRooms: vi.fn().mockResolvedValue({ rooms: [] }),
  createGameRoom: vi.fn().mockResolvedValue({ id: 'room-2', name: 'Salle test', joinCode: 'ABC123' }),
  previewCsv: vi.fn().mockResolvedValue({ valid: true, candles: [], candlesCount: 0, issues: [], issuesCount: 0, summary: {} }),
  updateRoomConfig: vi.fn(),
  setRoomSpeed: vi.fn().mockResolvedValue({}),
  seekRoom: vi.fn().mockResolvedValue({}),
  getRoomCandles: vi.fn().mockResolvedValue({ candles: [] }),
  getAllGameRooms: vi.fn().mockResolvedValue({ rooms: [DEMO_ROOM_DETAILS.room] }),
  getDemoRoom: vi.fn().mockResolvedValue(DEMO_ROOM_DETAILS),
  getGameRoomPortfolio: vi.fn().mockResolvedValue({
    portfolio: {
      id: 'pf-1',
      cash: 85000,
      initialCash: 100000,
      positionsMarketValue: 16158,
      totalValue: 101158,
      realizedPnl: 0,
      unrealizedPnl: 1158,
      returnAmount: 1158,
      returnPercent: 1.16,
    },
    positions: [],
    trades: [],
  }),
  getGameRoomDashboard: vi.fn().mockResolvedValue({
    room: { id: 'demo-room-1', name: 'Le mardi de la panique' },
    leaderboard: [],
    isMaster: false,
  }),
  getAiMarketAnalysis: vi.fn().mockResolvedValue({
    role: 'AI Market Analyst',
    currentMinute: 11,
    price: 2693,
    spread: 0.35,
    sentiment: 'Baissier',
    summary: 'Repli vers 2693 $US.',
    recommendations: ['Calibrer le risque'],
  }),
  askAiTradingCoach: vi.fn().mockResolvedValue({
    role: 'AI Trading Coach',
    answer: 'Votre portefeuille est en gain.',
  }),
  getAiPerformanceEval: vi.fn().mockResolvedValue({
    role: 'AI Performance Evaluator',
    score: 85,
    grade: 'Excellent',
    summary: 'Bonne gestion.',
    strengths: [],
    improvements: [],
  }),
}));

describe('GameRoomPage Component', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, '', '/game-room');
    vi.clearAllMocks();
  });

  it('affiche le lobby de selection des salles lorsque le trader arrive sans salle sauvegardee', async () => {
    render(
      <BrowserRouter>
        <GameRoomPage />
      </BrowserRouter>,
    );

    // Le lobby doit s'afficher avec son titre et la zone de saisie du code
    expect(await screen.findByText(/SALLES DE SIMULATION DISPONIBLES/i)).toBeInTheDocument();
    expect(await screen.findByText(/Choisissez votre salle/i)).toBeInTheDocument();
    expect(await screen.findByText(/REJOINDRE UNE SALLE/i)).toBeInTheDocument();

    // La salle de démonstration est listée dans le lobby
    expect(await screen.findByText(/Le mardi de la panique/i)).toBeInTheDocument();

    // Les contrôles du maître de jeu ne sont PAS présents
    expect(screen.queryByText(/Tableau de bord des participants/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Panneau du Meneur de Jeu/i)).not.toBeInTheDocument();
  });

  it('affiche l interface Etudiant lorsque isMaster est false et qu une salle est persistee', async () => {
    // Simuler un trader avec une salle déjà sauvegardée — passe directement dans la salle
    window.localStorage.setItem('alpharoom:game-room:active-id:test-user-id', 'demo-room-1');
    render(
      <BrowserRouter>
        <GameRoomPage />
      </BrowserRouter>,
    );

    // L'étudiant voit son badge de rôle (sub-bar visible car pas en mode lobby)
    expect(await screen.findByText(/Session Étudiant/i)).toBeInTheDocument();
    expect(await screen.findByText(/Simulation Trading Virtuel/i)).toBeInTheDocument();

    const pfBadges = await screen.findAllByText(/PORTEFEUILLE VIRTUEL/i);
    expect(pfBadges.length).toBeGreaterThan(0);

    // Le trader voit le bouton pour rejoindre une autre salle
    expect(screen.getByText(/Rejoindre une autre salle/i)).toBeInTheDocument();

    // Les contrôles du maître de jeu ne sont PAS présents
    expect(screen.queryByText(/Déclencher des chocs de marché/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tableau de bord des participants/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Panneau du Meneur de Jeu/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/CONTRÔLE PÉDAGOGIQUE/i)).not.toBeInTheDocument();
  });

  it('garde et recharge la salle active persistee en localStorage au lieu de revenir a la demo', async () => {
    window.localStorage.setItem('alpharoom:game-room:active-id:test-user-id', 'custom-room-42');
    getGameRoomDetails.mockResolvedValueOnce({
      room: {
        id: 'custom-room-42',
        name: 'Salle Personnalisée de Finance',
        joinCode: 'FIN42',
        status: 'running',
        scenarioId: 'custom',
        scenarioName: 'Salle Personnalisée de Finance',
        simElapsedSeconds: 300,
        currentMinute: 5.0,
        totalMinutes: 30,
        isMaster: false,
      },
      market: { symbol: 'XAU/USD', price: 2700, spread: 0.35, series: [] },
      book: { symbol: 'XAU/USD', lastPrice: 2700, bestBid: 2699, bestAsk: 2701, bids: [], asks: [] },
      participantsCount: 5,
      participants: [],
      recentEvents: [],
    });

    render(
      <BrowserRouter>
        <GameRoomPage />
      </BrowserRouter>,
    );

    expect((await screen.findAllByText('Salle Personnalisée de Finance')).length).toBeGreaterThan(0);
    expect(getGameRoomDetails).toHaveBeenCalledWith('custom-room-42', undefined);
  });
});
