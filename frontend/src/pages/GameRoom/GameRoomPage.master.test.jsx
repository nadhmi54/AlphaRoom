// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GameRoomPage from './GameRoomPage.jsx';
import { useAuth } from '../../context/useAuth.js';
import {
  getGameRoomDetails,
  getGameRoomDashboard,
  getMyRooms,
  setRoomSpeed,
} from '../../services/gameRoomService.js';

vi.mock('../../context/useAuth.js', () => ({
  useAuth: vi.fn(),
}));

const ROOM_DETAILS = {
  room: {
    id: 'room-1',
    name: 'Séance krach',
    joinCode: 'KRAK01',
    status: 'running',
    scenarioId: 'synthetic',
    scenarioName: 'Séance krach',
    assets: ['XAU/USD', 'BTC/USD'],
    activeSymbol: 'XAU/USD',
    sourceMode: 'synthetic',
    currency: 'USD',
    initialCapital: 50000,
    leverage: 10,
    commissionPercent: 0.2,
    allowShortSelling: true,
    maxExposure: null,
    riskLimitPercent: 2,
    maxParticipants: 30,
    simElapsedSeconds: 660,
    totalSimSeconds: 1800,
    currentMinute: 11,
    totalMinutes: 30,
    durationMinutes: 30,
    timeframe: '1m',
    playbackSpeed: 1,
    progressPercent: 37,
    isMaster: true,
  },
  market: {
    symbol: 'XAU/USD',
    price: 2693,
    spread: 0.35,
    source: 'synthetic',
    series: [
      { t: 0, price: 2700 },
      { t: 660, price: 2693 },
    ],
    symbols: [
      { symbol: 'XAU/USD', price: 2693, spread: 0.35 },
      { symbol: 'BTC/USD', price: 67000, spread: 30 },
    ],
  },
  book: {
    symbol: 'XAU/USD',
    lastPrice: 2693,
    bestBid: 2692.8,
    bestAsk: 2693.2,
    spread: 0.4,
    bids: [{ price: 2692.8, quantity: 15, orders: 3 }],
    asks: [{ price: 2693.2, quantity: 15, orders: 3 }],
  },
  participantsCount: 2,
  participants: [],
  recentEvents: [],
};

const MY_ROOMS = [
  {
    id: 'room-1',
    name: 'Séance krach',
    joinCode: 'KRAK01',
    status: 'running',
    sourceMode: 'synthetic',
    assets: ['XAU/USD', 'BTC/USD'],
    durationMinutes: 30,
    playbackSpeed: 1,
    initialCapital: 50000,
    currency: 'USD',
    participantsCount: 2,
    maxParticipants: 30,
    currentPrice: 2693,
  },
  {
    id: 'room-2',
    name: 'Replay 24 h',
    joinCode: 'REPL24',
    status: 'waiting',
    sourceMode: 'historical',
    assets: ['EUR/USD'],
    durationMinutes: 5,
    playbackSpeed: 48,
    initialCapital: 100000,
    currency: 'EUR',
    participantsCount: 0,
    maxParticipants: 30,
    currentPrice: 1.0834,
  },
];

vi.mock('../../services/gameRoomService.js', () => ({
  getMyRooms: vi.fn(),
  getDemoRoom: vi.fn(),
  getGameRoomDetails: vi.fn(),
  getGameRoomPortfolio: vi.fn().mockResolvedValue({
    portfolio: { cash: 50000, initialCash: 50000, totalValue: 50000, returnPercent: 0 },
    positions: [],
    trades: [],
  }),
  getGameRoomDashboard: vi.fn().mockResolvedValue({ room: { id: 'room-1' }, leaderboard: [], isMaster: true }),
  joinGameRoom: vi.fn(),
  placeSimOrder: vi.fn(),
  closeSimPosition: vi.fn(),
  controlGameRoom: vi.fn(),
  triggerGameMasterAction: vi.fn(),
  setRoomSpeed: vi.fn().mockResolvedValue({}),
  seekRoom: vi.fn().mockResolvedValue({}),
  createGameRoom: vi.fn(),
  previewCsv: vi.fn(),
  getAiMarketAnalysis: vi.fn().mockResolvedValue({}),
  askAiTradingCoach: vi.fn().mockResolvedValue({}),
  getAiPerformanceEval: vi.fn().mockResolvedValue({}),
}));

const renderPage = () =>
  render(
    <BrowserRouter>
      <GameRoomPage />
    </BrowserRouter>,
  );

describe('GameRoomPage — Meneur de Jeu', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      profile: { role: 'game_master', fullName: 'Prof. Test' },
      session: { user: { id: 'master-id' } },
    });
    getMyRooms.mockResolvedValue({ rooms: MY_ROOMS });
    getGameRoomDetails.mockResolvedValue(ROOM_DETAILS);
    setRoomSpeed.mockClear();
  });

  it('liste les salles du meneur et ouvre la séance en cours au chargement', async () => {
    renderPage();

    expect(await screen.findByText(/MES SALLES DE SIMULATION \(2\)/i)).toBeInTheDocument();
    // « Séance krach » apparaît dans le sélecteur de salle et dans l'en-tête
    expect(screen.getAllByText('Séance krach').length).toBeGreaterThan(0);
    expect(screen.getByText('Replay 24 h')).toBeInTheDocument();

    // La salle « en cours » est chargée en priorité
    await waitFor(() => expect(getGameRoomDetails).toHaveBeenCalledWith('room-1', undefined));
  });

  it('affiche le panneau enseignant avec la configuration, la vitesse et la timeline', async () => {
    renderPage();

    expect(await screen.findByText(/Panneau du Meneur de Jeu/i)).toBeInTheDocument();
    expect(screen.getByText(/CONFIGURATION DE LA SALLE/i)).toBeInTheDocument();
    expect(screen.getByText(/VITESSE DE RELECTURE/i)).toBeInTheDocument();
    expect(screen.getByText(/CURSEUR DE SÉANCE \(TIMELINE\)/i)).toBeInTheDocument();

    // Rappel des règles appliquées aux étudiants
    expect(screen.getByText('x10')).toBeInTheDocument();
    expect(screen.getByText('Autorisée')).toBeInTheDocument();
    expect(screen.getByText('2 %')).toBeInTheDocument();
  });

  it('change d’actif et recharge le marché du symbole choisi', async () => {
    renderPage();

    const btcTab = await screen.findByRole('tab', { name: /BTC\/USD/i });
    fireEvent.click(btcTab);

    await waitFor(() => expect(getGameRoomDetails).toHaveBeenCalledWith('room-1', 'BTC/USD'));
  });

  it('applique une nouvelle vitesse de relecture', async () => {
    renderPage();

    const speedButton = await screen.findByRole('button', { name: 'x12' });
    fireEvent.click(speedButton);

    await waitFor(() => expect(setRoomSpeed).toHaveBeenCalledWith('room-1', 12));
  });

  it('bascule sur une autre salle depuis le sélecteur', async () => {
    renderPage();

    const otherRoom = await screen.findByText('Replay 24 h');
    fireEvent.click(otherRoom.closest('button'));

    await waitFor(() => expect(getGameRoomDetails).toHaveBeenCalledWith('room-2', undefined));
    await waitFor(() => expect(getGameRoomDashboard).toHaveBeenCalledWith('room-2'));
  });

  it('ouvre l’assistant de création de salle', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /\+ Créer une salle/i }));

    expect(await screen.findByText(/Créer et configurer une Game Room/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nom de la salle/i)).toBeInTheDocument();
  });
});
