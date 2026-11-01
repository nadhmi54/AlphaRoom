// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import GameRoomPage from './GameRoomPage.jsx';

vi.mock('../../context/useAuth.js', () => ({
  useAuth: vi.fn(() => ({
    profile: { role: 'trader', fullName: 'Étudiant Test' },
    session: { user: { id: 'test-user-id' } },
  })),
}));

vi.mock('../../services/gameRoomService.js', () => ({
  getDemoRoom: vi.fn().mockResolvedValue({
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
      isMaster: false, // Étudiant
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
  }),
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
  it('affiche automatiquement et uniquement l’interface Étudiant lorsque isMaster est false', async () => {
    render(
      <BrowserRouter>
        <GameRoomPage />
      </BrowserRouter>,
    );

    // L'étudiant voit son badge de rôle
    expect(await screen.findByText(/Session Étudiant/i)).toBeInTheDocument();
    expect(await screen.findByText(/Simulation Trading Virtuel/i)).toBeInTheDocument();

    const pfBadges = await screen.findAllByText(/PORTEFEUILLE VIRTUEL/i);
    expect(pfBadges.length).toBeGreaterThan(0);

    // Les contrôles du maître de jeu ne sont PAS présents
    expect(screen.queryByText(/Déclencher des chocs de marché/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Retour en arrière \(Rollback & Replay\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tableau de bord des participants/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Panneau du Meneur de Jeu/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/CONTRÔLE PÉDAGOGIQUE · ENSEIGNANT/i)).not.toBeInTheDocument();
  });
});
