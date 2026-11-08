import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/aiService.js', () => ({ getLiveClass: vi.fn() }));

const service = await import('../../services/aiService.js');
const { default: LiveClassPanel } = await import('./LiveClassPanel.jsx');

const live = {
  minute: 14,
  durationMinutes: 30,
  summary: ['1 participant sur 2 a une position sans stop-loss.'],
  rows: [
    { participantId: 'a', name: 'Amine', status: 'alert', pnl: -1200, returnPct: -1.2, exposurePct: 94.5, openPositions: 1, unprotected: 1, tradeCount: 1, lastNews: 'pending', flags: [{ code: 'no_protection', severity: 'alert', title: 'XAU/USD : position sans stop-loss' }] },
    { participantId: 's', name: 'Sarra', status: 'ok', pnl: 300, returnPct: 0.3, exposurePct: 13.5, openPositions: 1, unprotected: 0, tradeCount: 1, lastNews: 'reacted', flags: [] },
  ],
};

describe('LiveClassPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('affiche le résumé et les participants à aider en premier', async () => {
    service.getLiveClass.mockResolvedValue(live);
    render(<LiveClassPanel roomId="salle-1" />);
    expect(await screen.findByText('1 participant sur 2 a une position sans stop-loss.')).toBeInTheDocument();
    expect(screen.getByText('1 à suivre')).toBeInTheDocument();
    const names = screen.getAllByRole('rowheader').map((cell) => cell.textContent);
    expect(names).toEqual(['Amine', 'Sarra']);
    expect(screen.getByText('À aider')).toBeInTheDocument();
    expect(screen.getByText('XAU/USD : position sans stop-loss')).toBeInTheDocument();
    expect(service.getLiveClass).toHaveBeenCalledWith({ sessionId: 'salle-1' });
  });

  it('montre l’erreur sans casser la page', async () => {
    service.getLiveClass.mockRejectedValue(new Error('Suivi indisponible.'));
    render(<LiveClassPanel roomId="salle-1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Suivi indisponible.');
  });

  it('se replie et ne sonde plus le serveur', async () => {
    service.getLiveClass.mockResolvedValue(live);
    render(<LiveClassPanel roomId="salle-1" />);
    await screen.findByText('Amine');
    fireEvent.click(screen.getByRole('button', { name: /Suivi de la classe en direct/ }));
    await waitFor(() => expect(screen.queryByText('Amine')).not.toBeInTheDocument());
  });

  it('n’appelle rien sans identifiant de salle', () => {
    render(<LiveClassPanel />);
    expect(service.getLiveClass).not.toHaveBeenCalled();
  });
});
