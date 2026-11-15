import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/aiService.js', () => ({ getProgress: vi.fn() }));

const service = await import('../../services/aiService.js');
const { default: ProgressPanel } = await import('./ProgressPanel.jsx');

const point = (id, score, sessionId = 's1') => ({
  reportId: id,
  sessionId,
  run: 1,
  at: '2026-11-01T10:00:00Z',
  overall: { score, outOf: 4 },
  criteria: [],
});

describe('ProgressPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('montre la dernière note, l’écart, la courbe, les critères et la piste de travail', async () => {
    service.getProgress.mockResolvedValue({
      points: [point('a', 2), point('b', 2.5, 's2')],
      delta: 0.5,
      direction: 'up',
      criteriaTrends: [{ id: 'risque', label: 'Gestion du risque', previous: 1, latest: 2, delta: 1 }],
      focus: { id: 'pertes', label: 'Maîtrise des pertes', score: 2 },
    });
    render(<ProgressPanel titles={{ s1: 'Séance 1', s2: 'Séance 2' }} refreshKey={2} />);
    expect(await screen.findByLabelText('Ma progression')).toBeInTheDocument();
    expect(screen.getByText('2,5')).toBeInTheDocument();
    expect(screen.getByText(/\+0,5 depuis le bilan précédent/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Évolution de ta note/ })).toBeInTheDocument();
    expect(screen.getByText('1 → 2 ▲')).toBeInTheDocument();
    expect(screen.getByText('Maîtrise des pertes')).toBeInTheDocument();
    expect(screen.getByText('À travailler')).toBeInTheDocument();
  });

  it('annonce la courbe à venir avec un seul bilan publié', async () => {
    service.getProgress.mockResolvedValue({ points: [point('a', 3)], delta: null, direction: null, criteriaTrends: [], focus: null });
    render(<ProgressPanel refreshKey={1} />);
    expect(await screen.findByText(/dès ton deuxième bilan publié/)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Évolution/ })).not.toBeInTheDocument();
  });

  it('n’affiche rien sans bilan publié ni en cas d’erreur', async () => {
    service.getProgress.mockResolvedValue({ points: [], delta: null, direction: null, criteriaTrends: [], focus: null });
    const first = render(<ProgressPanel refreshKey={0} />);
    await vi.waitFor(() => expect(service.getProgress).toHaveBeenCalledTimes(1));
    expect(first.container).toBeEmptyDOMElement();

    service.getProgress.mockRejectedValue(new Error('indisponible'));
    const second = render(<ProgressPanel refreshKey={0} />);
    await vi.waitFor(() => expect(service.getProgress).toHaveBeenCalledTimes(2));
    expect(second.container).toBeEmptyDOMElement();
  });
});
