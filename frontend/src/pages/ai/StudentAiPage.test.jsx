import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoSession, sampleReport } from './testData.js';

vi.mock('../../services/aiService.js', () => ({
  listAiSessions: vi.fn(),
  listReports: vi.fn(),
  askCoach: vi.fn(),
}));

const service = await import('../../services/aiService.js');
const { default: StudentAiPage } = await import('./StudentAiPage.jsx');

const renderPage = () =>
  render(
    <MemoryRouter>
      <StudentAiPage />
    </MemoryRouter>,
  );

describe('StudentAiPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche le bilan publié avec la règle derrière la note', async () => {
    service.listAiSessions.mockResolvedValue([{ ...demoSession, joined: true }]);
    service.listReports.mockImplementation(async (_s, run) =>
      run === 1 ? [sampleReport({ status: 'validated', published: true, validatedAt: '2026-11-01T12:00:00Z' })] : [],
    );
    renderPage();
    expect(await screen.findByText('Pourquoi cette note ?')).toBeInTheDocument();
    expect(screen.getByText(/au-delà de 80 %/)).toBeInTheDocument();
    expect(service.listReports).toHaveBeenCalledWith('mardi-panique', 1);
    expect(service.listReports).toHaveBeenCalledWith('mardi-panique', 2);
  });

  it('explique qu’aucun bilan n’est publié tant que l’enseignant n’a pas validé', async () => {
    service.listAiSessions.mockResolvedValue([{ ...demoSession, joined: true }]);
    service.listReports.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('Aucun bilan publié pour l’instant')).toBeInTheDocument();
    expect(screen.getByText(/relit et valide chaque bilan/)).toBeInTheDocument();
  });

  it('affiche l’erreur du serveur', async () => {
    service.listAiSessions.mockRejectedValue(new Error('La simulation n’est pas encore branchée au module IA (AI_SESSION_SOURCE).'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('pas encore branchée'));
  });
});
