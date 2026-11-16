import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describeChange } from './aiLabels.js';

vi.mock('../../services/aiService.js', () => ({ getReportHistory: vi.fn() }));

const service = await import('../../services/aiService.js');
const { default: ReportHistory } = await import('./ReportHistory.jsx');

function open() {
  const details = screen.getByText('Historique des corrections').closest('details');
  details.open = true;
  fireEvent(details, new Event('toggle'));
}

describe('ReportHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ne charge rien tant que l’historique est fermé', () => {
    render(<ReportHistory reportId="r1" version="v1" />);
    expect(service.getReportHistory).not.toHaveBeenCalled();
  });

  it('raconte la génération, la correction et la validation', async () => {
    service.getReportHistory.mockResolvedValue({
      reportId: 'r1',
      revisions: [
        { id: '1', kind: 'generated', at: '2026-11-01T10:00:00Z', byYou: true, changes: [] },
        {
          id: '2',
          kind: 'edited',
          at: '2026-11-01T11:00:00Z',
          byYou: true,
          changes: [{ field: 'teacherScore', id: 'risque', label: 'Gestion du risque', from: null, to: 3 }],
        },
        { id: '3', kind: 'validated', at: '2026-11-01T12:00:00Z', byYou: false, changes: [] },
      ],
    });
    render(<ReportHistory reportId="r1" version="v1" />);
    open();
    expect(await screen.findByText('Brouillon généré')).toBeInTheDocument();
    expect(screen.getByText('Corrigé par l’enseignant')).toBeInTheDocument();
    expect(screen.getByText('Gestion du risque : note corrigée aucune → 3')).toBeInTheDocument();
    expect(screen.getByText('Validé et publié')).toBeInTheDocument();
    expect(screen.getByText(/un autre enseignant/)).toBeInTheDocument();
    expect(service.getReportHistory).toHaveBeenCalledWith('r1');
  });

  it('se recharge quand le bilan change pendant que le panneau est ouvert', async () => {
    service.getReportHistory.mockResolvedValue({ reportId: 'r1', revisions: [] });
    const { rerender } = render(<ReportHistory reportId="r1" version="v1" />);
    open();
    expect(await screen.findByText('Aucune modification enregistrée.')).toBeInTheDocument();
    rerender(<ReportHistory reportId="r1" version="v2" />);
    await vi.waitFor(() => expect(service.getReportHistory).toHaveBeenCalledTimes(2));
  });

  it('affiche l’erreur du serveur', async () => {
    service.getReportHistory.mockRejectedValue(new Error('Réservé à l’enseignant.'));
    render(<ReportHistory reportId="r1" version="v1" />);
    open();
    expect(await screen.findByText('Réservé à l’enseignant.')).toBeInTheDocument();
  });
});

describe('describeChange', () => {
  it('décrit chaque type de changement', () => {
    expect(describeChange({ field: 'teacherScore', label: 'Risque', from: 2, to: null })).toBe('Risque : note corrigée 2 → correction retirée');
    expect(describeChange({ field: 'comment', label: 'Risque', from: 'a', to: 'b' })).toBe('Risque : commentaire modifié');
    expect(describeChange({ field: 'overall', from: 2, to: 2.5 })).toBe('Moyenne : 2 → 2,5');
    expect(describeChange({ field: 'strengths', from: ['a'], to: ['a', 'b'] })).toBe('Points forts modifiés (1 → 2)');
    expect(describeChange({ field: 'improvements', from: [], to: ['a'] })).toBe('Pistes d’amélioration modifiées (0 → 1)');
    expect(describeChange({ field: 'summary', from: 'x', to: 'Nouvelle synthèse.' })).toBe('Synthèse modifiée : « Nouvelle synthèse. »');
  });
});
