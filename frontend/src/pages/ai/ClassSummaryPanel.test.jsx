import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/aiService.js', () => ({ getClassSummary: vi.fn() }));

const service = await import('../../services/aiService.js');
const { default: ClassSummaryPanel } = await import('./ClassSummaryPanel.jsx');

const summary = {
  sessionId: 's1',
  run: 1,
  total: 3,
  drafts: 1,
  validatedNotPublished: 1,
  published: 1,
  expectedParticipants: 4,
  withoutReport: 1,
  outOf: 4,
  overall: { count: 3, mean: 2.67, median: 2.5, min: 1.5, max: 4 },
  distribution: [
    { from: 0, to: 1, count: 0 },
    { from: 1, to: 2, count: 1 },
    { from: 2, to: 3, count: 1 },
    { from: 3, to: 4, count: 1 },
  ],
  criteria: [],
  weakest: { id: 'pertes', label: 'Maîtrise des pertes', mean: 2.33 },
  strongest: { id: 'risque', label: 'Gestion du risque', mean: 2.67 },
};

describe('ClassSummaryPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('affiche l’avancement, la note moyenne et les critères extrêmes', async () => {
    service.getClassSummary.mockResolvedValue(summary);
    render(<ClassSummaryPanel sessionId="s1" run={1} refreshKey="a" />);
    expect(await screen.findByLabelText('Synthèse de la classe')).toBeInTheDocument();
    expect(screen.getByText('1 sans bilan')).toBeInTheDocument();
    expect(screen.getByText('brouillons')).toBeInTheDocument();
    expect(screen.getByText('1 validé, non publié')).toBeInTheDocument();
    expect(screen.getByText('2,67')).toBeInTheDocument();
    expect(screen.getByText(/médiane 2,5 · de 1,5 à 4/)).toBeInTheDocument();
    expect(screen.getByText('Maîtrise des pertes')).toBeInTheDocument();
    expect(screen.getByText('Gestion du risque')).toBeInTheDocument();
    expect(service.getClassSummary).toHaveBeenCalledWith('s1', 1);
  });

  it('se recalcule quand les bilans changent', async () => {
    service.getClassSummary.mockResolvedValue(summary);
    const { rerender } = render(<ClassSummaryPanel sessionId="s1" run={1} refreshKey="a" />);
    await screen.findByLabelText('Synthèse de la classe');
    rerender(<ClassSummaryPanel sessionId="s1" run={1} refreshKey="b" />);
    await vi.waitFor(() => expect(service.getClassSummary).toHaveBeenCalledTimes(2));
  });

  it('n’affiche rien sans bilan', async () => {
    service.getClassSummary.mockResolvedValue({ ...summary, total: 0, overall: null });
    const { container } = render(<ClassSummaryPanel sessionId="s1" run={1} refreshKey="a" />);
    await vi.waitFor(() => expect(service.getClassSummary).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('reste discret si la synthèse est indisponible', async () => {
    service.getClassSummary.mockRejectedValue(new Error('indisponible'));
    const { container } = render(<ClassSummaryPanel sessionId="s1" run={1} refreshKey="a" />);
    await vi.waitFor(() => expect(service.getClassSummary).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
