import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoSession, marketResult, replayResult, sampleReport } from './testData.js';

vi.mock('../../services/aiService.js', () => ({
  listAiSessions: vi.fn(),
  listReports: vi.fn(),
  generateReports: vi.fn(),
  editReport: vi.fn(),
  validateReport: vi.fn(),
  getAiUsage: vi.fn(),
  analyzeMarket: vi.fn(),
  analyzeReplay: vi.fn(),
}));

const service = await import('../../services/aiService.js');
const { default: TeacherAiPage } = await import('./TeacherAiPage.jsx');

const renderPage = () =>
  render(
    <MemoryRouter>
      <TeacherAiPage />
    </MemoryRouter>,
  );

describe('TeacherAiPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.listAiSessions.mockResolvedValue([demoSession]);
    service.listReports.mockResolvedValue([sampleReport()]);
    service.getAiUsage.mockResolvedValue({ calls: 4, inputTokens: 1200, outputTokens: 80 });
  });

  it('charge la séance, son dernier passage et les bilans', async () => {
    renderPage();
    expect(await screen.findByText('Amine B.')).toBeInTheDocument();
    expect(service.listReports).toHaveBeenCalledWith('mardi-panique', 2);
    expect(screen.getByText(/Consommation IA : 4 appels/)).toBeInTheDocument();
    expect(screen.getByText('Brouillon')).toBeInTheDocument();
    expect(screen.getByText('Règles du code')).toBeInTheDocument();
  });

  it('change de passage', async () => {
    renderPage();
    await screen.findByText('Amine B.');
    fireEvent.change(screen.getByLabelText('Passage'), { target: { value: '1' } });
    await waitFor(() => expect(service.listReports).toHaveBeenCalledWith('mardi-panique', 1));
  });

  it('génère les brouillons et signale les bilans validés conservés', async () => {
    service.generateReports.mockResolvedValue({ reports: [sampleReport()], skippedValidated: ['etu_02'] });
    renderPage();
    await screen.findByText('Amine B.');
    fireEvent.click(screen.getByRole('button', { name: 'Régénérer les brouillons' }));
    expect(await screen.findByRole('status')).toHaveTextContent('1 brouillon généré. 1 bilan déjà validé conservé tel quel.');
    expect(service.generateReports).toHaveBeenCalledWith('mardi-panique', 2);
  });

  it('affiche une aide quand la simulation n’est pas branchée', async () => {
    service.listAiSessions.mockRejectedValue(new Error('La simulation n’est pas encore branchée au module IA (AI_SESSION_SOURCE).'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('AI_SESSION_SOURCE=demo');
  });

  it('sans liste de séances, permet de saisir l’identifiant à la main', async () => {
    service.listAiSessions.mockResolvedValue([]);
    renderPage();
    const input = await screen.findByLabelText('Identifiant de la séance');
    fireEvent.change(input, { target: { value: 'ma-seance' } });
    await waitFor(() => expect(service.listReports).toHaveBeenCalledWith('ma-seance', 1));
  });

  describe('éditeur de bilan', () => {
    async function openEditor() {
      renderPage();
      await screen.findByText('Amine B.');
      fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
      return screen.findByRole('region', { name: /Bilan de Amine B\./ });
    }

    it('montre règle, preuves et trace', async () => {
      const editor = await openEditor();
      expect(within(editor).getByText(/au-delà de 80 %/)).toBeInTheDocument();
      expect(within(editor).getByText('abc123')).toBeInTheDocument();
      expect(within(editor).getByText('Texte généré par le code (règles)')).toBeInTheDocument();
    });

    it('enregistre une note corrigée et un commentaire, puis revient en brouillon', async () => {
      const updated = sampleReport({ updatedAt: '2026-11-01T11:00:00Z' });
      updated.content.criteria[0].teacherScore = 3;
      service.editReport.mockResolvedValue(updated);
      const editor = await openEditor();

      fireEvent.change(within(editor).getByLabelText('Note corrigée (0 à 4)', { selector: '#score-r1-gestion_risque' }), { target: { value: '3' } });
      fireEvent.click(within(editor).getByRole('button', { name: 'Enregistrer les modifications' }));

      await waitFor(() => expect(service.editReport).toHaveBeenCalled());
      const [id, changes] = service.editReport.mock.calls[0];
      expect(id).toBe('r1');
      expect(changes.criteria.find((c) => c.id === 'gestion_risque').teacherScore).toBe(3);
      expect(changes.criteria.find((c) => c.id === 'reactivite').teacherScore).toBeNull();
      expect(await screen.findByRole('status')).toHaveTextContent('repasse en brouillon');
    });

    it('refuse une note hors barème', async () => {
      const editor = await openEditor();
      fireEvent.change(within(editor).getByLabelText('Note corrigée (0 à 4)', { selector: '#score-r1-gestion_risque' }), { target: { value: '7' } });
      expect(within(editor).getByText(/entier entre 0 et le maximum/)).toBeInTheDocument();
      expect(within(editor).getByRole('button', { name: 'Enregistrer les modifications' })).toBeDisabled();
    });

    it('oblige à enregistrer avant de valider', async () => {
      const editor = await openEditor();
      fireEvent.change(within(editor).getByLabelText('Synthèse'), { target: { value: 'Nouvelle synthèse.' } });
      expect(within(editor).getByRole('button', { name: 'Valider et publier' })).toBeDisabled();
    });

    it('valide et publie', async () => {
      service.validateReport.mockResolvedValue(sampleReport({ status: 'validated', published: true, updatedAt: '2026-11-01T12:00:00Z' }));
      const editor = await openEditor();
      fireEvent.click(within(editor).getByRole('button', { name: 'Valider et publier' }));
      await waitFor(() => expect(service.validateReport).toHaveBeenCalledWith('r1', true));
      expect(await screen.findByRole('status')).toHaveTextContent('validé et publié');
      expect(screen.getByRole('button', { name: 'Retirer de la publication' })).toBeInTheDocument();
    });

    it('retire un point proposé par l’IA', async () => {
      service.editReport.mockResolvedValue(sampleReport({ updatedAt: '2026-11-01T11:00:00Z' }));
      const editor = await openEditor();
      fireEvent.click(within(editor).getAllByRole('button', { name: 'Retirer' })[0]);
      fireEvent.click(within(editor).getByRole('button', { name: 'Enregistrer les modifications' }));
      await waitFor(() => expect(service.editReport).toHaveBeenCalled());
      expect(service.editReport.mock.calls[0][1].strengths).toEqual([]);
    });

    it('affiche l’erreur du serveur', async () => {
      service.validateReport.mockRejectedValue(new Error('Bilan introuvable.'));
      const editor = await openEditor();
      fireEvent.click(within(editor).getByRole('button', { name: 'Valider' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Bilan introuvable.');
    });
  });

  describe('marché et replay', () => {
    it('analyse le marché', async () => {
      service.analyzeMarket.mockResolvedValue(marketResult);
      renderPage();
      await screen.findByText('Amine B.');
      fireEvent.click(screen.getByRole('tab', { name: 'Marché' }));
      fireEvent.click(screen.getByRole('button', { name: 'Analyser le marché' }));
      expect(await screen.findByText(/de 2 700 à 2 640/)).toBeInTheDocument();
      expect(screen.getByText(/2 \/ 4 participants ont réagi/)).toBeInTheDocument();
      expect(screen.getByText('Aucun modèle configuré (stub).')).toBeInTheDocument();
      expect(service.analyzeMarket).toHaveBeenCalledWith('mardi-panique', 2);
    });

    it('compare deux passages et montre le commentaire vérifié', async () => {
      service.analyzeReplay.mockResolvedValue(replayResult);
      renderPage();
      await screen.findByText('Amine B.');
      fireEvent.click(screen.getByRole('tab', { name: 'Replay' }));
      fireEvent.click(screen.getByRole('button', { name: 'Comparer' }));
      expect(await screen.findByText(/1 amélioré, 3 inchangés/)).toBeInTheDocument();
      expect(screen.getByText('1,65 → 3,4')).toBeInTheDocument();
      expect(screen.getByText('Amélioré')).toBeInTheDocument();
      expect(screen.getByText(/nettement réduit son exposition/)).toBeInTheDocument();
      expect(service.analyzeReplay).toHaveBeenCalledWith('mardi-panique', 1, 2);
    });

    it('signale une erreur de comparaison', async () => {
      service.analyzeReplay.mockRejectedValue(new Error('Séance introuvable'));
      renderPage();
      await screen.findByText('Amine B.');
      fireEvent.click(screen.getByRole('tab', { name: 'Replay' }));
      fireEvent.click(screen.getByRole('button', { name: 'Comparer' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Séance introuvable');
    });
  });
});
