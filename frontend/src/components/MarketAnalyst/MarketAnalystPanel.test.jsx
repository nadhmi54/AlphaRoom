import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MarketAnalystPanel from './MarketAnalystPanel.jsx';
import { getAiMarketAnalysis } from '../../services/gameRoomService.js';

vi.mock('../../services/gameRoomService.js', () => ({ getAiMarketAnalysis: vi.fn() }));

const result = {
  analysis: {
    highlights: [
      { text: 'XAU/USD : de 2 700 à 2 618 (−3 %).', evidence: [{ type: 'minute', value: 23 }] },
      { text: 'Minute 22, price_shock : 0 participant sur 2 a passé un ordre.', evidence: [] },
    ],
  },
  commentary: 'Le marché a chuté après le choc de la minute 22.',
  commentarySource: 'llm',
};

describe('MarketAnalystPanel', () => {
  beforeEach(() => vi.mocked(getAiMarketAnalysis).mockReset());

  it('reste fermé tant qu’on ne l’ouvre pas, puis charge l’analyse de la salle', async () => {
    vi.mocked(getAiMarketAnalysis).mockResolvedValue(result);
    render(<MarketAnalystPanel roomId="room-1" />);
    expect(getAiMarketAnalysis).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /analyste de marché ia/i }));
    expect(await screen.findByText(/de 2 700 à 2 618/)).toBeInTheDocument();
    expect(getAiMarketAnalysis).toHaveBeenCalledWith('room-1');
    expect(screen.getByText(/chuté après le choc/)).toBeInTheDocument();
    expect(screen.getByText(/chiffres vérifiés/)).toBeInTheDocument();
  });

  it('affiche l’erreur du serveur et permet d’actualiser', async () => {
    vi.mocked(getAiMarketAnalysis).mockRejectedValueOnce(new Error('Salle introuvable.')).mockResolvedValueOnce(result);
    render(<MarketAnalystPanel roomId="room-1" />);
    fireEvent.click(screen.getByRole('button', { name: /analyste de marché ia/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Salle introuvable.');

    fireEvent.click(screen.getByRole('button', { name: /actualiser/i }));
    await waitFor(() => expect(screen.getByText(/de 2 700 à 2 618/)).toBeInTheDocument());
  });

  it('indique quand il n’y a pas encore de mouvement à lire', async () => {
    vi.mocked(getAiMarketAnalysis).mockResolvedValue({ analysis: { highlights: [] }, commentary: null });
    render(<MarketAnalystPanel roomId="room-1" />);
    fireEvent.click(screen.getByRole('button', { name: /analyste de marché ia/i }));
    expect(await screen.findByText(/pas encore assez de mouvements/i)).toBeInTheDocument();
  });
});
