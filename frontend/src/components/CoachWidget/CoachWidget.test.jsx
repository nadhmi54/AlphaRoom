import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../context/authContext.js';

vi.mock('../../services/aiService.js', () => ({ askCoach: vi.fn() }));

const service = await import('../../services/aiService.js');
const { default: CoachWidget } = await import('./CoachWidget.jsx');

const reply = (overrides = {}) => ({
  answer: 'Ton exposition maximale a atteint 91,8 % de ton capital.',
  source: 'rules',
  evidence: [{ type: 'minute', value: 5 }],
  sessionId: 'mardi-panique',
  run: 2,
  ...overrides,
});

const renderWidget = (props = {}, signedIn = true) =>
  render(
    <AuthContext.Provider value={{ session: signedIn ? { user: {} } : null, profile: null }}>
      <CoachWidget {...props} />
    </AuthContext.Provider>,
  );

describe('CoachWidget', () => {
  beforeEach(() => vi.clearAllMocks());

  it('est invisible quand personne n’est connecté', () => {
    renderWidget({}, false);
    expect(screen.queryByRole('button', { name: /coach/i })).not.toBeInTheDocument();
  });

  it('s’ouvre, propose des questions et rappelle ses limites', () => {
    renderWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le coach de trading' }));
    expect(screen.getByRole('dialog', { name: 'Coach de trading' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mon risque est-il élevé ?' })).toBeInTheDocument();
    expect(screen.getByText(/ne donne aucun conseil d’investissement/)).toBeInTheDocument();
  });

  it('envoie une question et montre la réponse avec ses preuves et sa source', async () => {
    service.askCoach.mockResolvedValue(reply());
    renderWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le coach de trading' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mon risque est-il élevé ?' }));

    expect(await screen.findByText(/91,8 % de ton capital/)).toBeInTheDocument();
    expect(screen.getByText('minute 5')).toBeInTheDocument();
    expect(screen.getByText(/Explication calculée à partir de tes données · séance mardi-panique, passage 2/)).toBeInTheDocument();
    expect(service.askCoach).toHaveBeenCalledWith({ question: 'Mon risque est-il élevé ?', history: [] });
  });

  it('indique quand le texte est rédigé par l’IA', async () => {
    service.askCoach.mockResolvedValue(reply({ source: 'llm' }));
    renderWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le coach de trading' }));
    fireEvent.change(screen.getByLabelText('Ta question au coach'), { target: { value: 'bonjour' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(await screen.findByText(/Rédigé par l’IA · chiffres vérifiés/)).toBeInTheDocument();
  });

  it('renvoie l’historique de la conversation à la question suivante', async () => {
    service.askCoach.mockResolvedValue(reply());
    renderWidget({ sessionId: 'mardi-panique', run: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le coach de trading' }));
    const input = screen.getByLabelText('Ta question au coach');
    fireEvent.change(input, { target: { value: 'première' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await screen.findByText(/91,8 %/);
    fireEvent.change(input, { target: { value: 'seconde' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(service.askCoach).toHaveBeenCalledTimes(2));
    expect(service.askCoach.mock.calls[1][0]).toEqual({
      question: 'seconde',
      history: [
        { role: 'user', content: 'première' },
        { role: 'assistant', content: reply().answer },
      ],
      sessionId: 'mardi-panique',
      run: 1,
    });
  });

  it('affiche l’erreur (ex. trop de questions, aucune séance)', async () => {
    service.askCoach.mockRejectedValue(new Error('Tu ne participes à aucune séance pour le moment.'));
    renderWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le coach de trading' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pourquoi ai-je perdu ?' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('aucune séance');
  });

  it('ne laisse pas envoyer une question vide et se ferme avec Échap', () => {
    renderWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le coach de trading' }));
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
    fireEvent.keyDown(screen.getByLabelText('Ta question au coach'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
