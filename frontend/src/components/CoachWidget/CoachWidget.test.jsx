import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../context/authContext.js';

vi.mock('../../services/aiService.js', () => ({
  streamCoach: vi.fn(),
  getGuideAlerts: vi.fn(),
  getGuideBriefing: vi.fn(),
  getGuideDebrief: vi.fn(),
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

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

/** Simule le flux du serveur : (éventuels) événements puis la réponse finale. */
const streams = (finalReply, events = []) =>
  service.streamCoach.mockImplementation(async (_payload, { onEvent }) => {
    events.forEach((event) => onEvent(event));
    onEvent({ type: 'done', reply: finalReply });
  });

const renderWidget = (props = {}, signedIn = true) =>
  render(
    <AuthContext.Provider value={{ session: signedIn ? { user: { id: 'u1' } } : null, profile: null }}>
      <CoachWidget {...props} />
    </AuthContext.Provider>,
  );

const openCoach = () => fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le coach de trading' }));
const field = () => screen.getByLabelText('Ton message au coach');

describe('CoachWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    service.getGuideAlerts.mockResolvedValue({ alerts: [] });
    service.getGuideBriefing.mockResolvedValue({ first: false });
    service.listConversations.mockResolvedValue({ conversations: [] });
  });

  it('est invisible quand personne n’est connecté', () => {
    renderWidget({}, false);
    expect(screen.queryByRole('button', { name: /coach/i })).not.toBeInTheDocument();
  });

  it('s’ouvre, propose des idées de questions et rappelle ses limites', () => {
    renderWidget();
    openCoach();
    expect(screen.getByRole('dialog', { name: 'Coach de trading' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Où j’en suis en ce moment ?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Et si le prix baisse de 3 % ?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quel marché a le mieux performé ce mois-ci ?' })).toBeInTheDocument();
    expect(screen.getByText(/ne sont pas des conseils financiers/)).toBeInTheDocument();
  });

  it('envoie une question et montre la réponse avec ses preuves et sa source', async () => {
    streams(reply());
    renderWidget();
    openCoach();
    fireEvent.click(screen.getByRole('button', { name: 'Où j’en suis en ce moment ?' }));

    expect(await screen.findByText(/91,8 % de ton capital/)).toBeInTheDocument();
    expect(screen.getByText('minute 5')).toBeInTheDocument();
    expect(screen.getByText(/Explication calculée à partir de tes données · séance mardi-panique, passage 2/)).toBeInTheDocument();
    expect(service.streamCoach.mock.calls[0][0]).toEqual({ question: 'Où j’en suis en ce moment ?' });
  });

  it('écrit la réponse en direct, indique les outils consultés puis la mise en forme', async () => {
    let finish;
    service.streamCoach.mockImplementation(
      (_payload, { onEvent }) =>
        new Promise((resolve) => {
          onEvent({ type: 'tool', name: 'simulate_price_move' });
          onEvent({ type: 'delta', text: 'Si le prix baisse, **tu perdrais** ' });
          finish = () => {
            onEvent({ type: 'delta', text: 'environ 1 200 $.' });
            onEvent({ type: 'done', reply: reply({ answer: 'Si le prix baisse, **tu perdrais** environ 1 200 $.', source: 'llm', toolsUsed: ['simulate_price_move'] }) });
            resolve();
          };
        }),
    );
    renderWidget();
    openCoach();
    fireEvent.change(field(), { target: { value: 'Et si le prix baisse de 3 % ?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText(/tu perdrais/)).toBeInTheDocument();
    expect(screen.getByText('tu perdrais').tagName).toBe('STRONG');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    finish();
    expect(await screen.findByText(/environ 1 200 \$\./)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument());
    expect(screen.getByText('A consulté : une simulation de prix')).toBeInTheDocument();
    expect(screen.getByText(/Rédigé par l’IA/)).toBeInTheDocument();
  });

  it('Entrée envoie, Maj+Entrée ne fait que passer à la ligne', async () => {
    streams(reply({ source: 'llm' }));
    renderWidget();
    openCoach();
    fireEvent.change(field(), { target: { value: 'bonjour' } });
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    expect(service.streamCoach).not.toHaveBeenCalled();
    fireEvent.keyDown(field(), { key: 'Enter' });
    await waitFor(() => expect(service.streamCoach).toHaveBeenCalledTimes(1));
    expect(service.streamCoach.mock.calls[0][0].question).toBe('bonjour');
  });

  it('envoie l’identifiant de la discussion (et non l’historique) pour que le serveur s’en souvienne', async () => {
    streams(reply({ conversationId: 'c-1' }), [{ type: 'conversation', id: 'c-1', title: 'première' }]);
    renderWidget({ sessionId: 'mardi-panique', run: 1 });
    openCoach();
    fireEvent.change(field(), { target: { value: 'première' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await screen.findByText(/91,8 %/);
    expect(service.streamCoach.mock.calls[0][0]).toEqual({ question: 'première', sessionId: 'mardi-panique', run: 1 });

    fireEvent.change(field(), { target: { value: 'seconde' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(service.streamCoach).toHaveBeenCalledTimes(2));
    expect(service.streamCoach.mock.calls[1][0]).toEqual({ question: 'seconde', conversationId: 'c-1', sessionId: 'mardi-panique', run: 1 });
  });

  it('rouvre la dernière discussion de la séance après un rechargement', async () => {
    streams(reply({ answer: 'Voici mon analyse détaillée.', conversationId: 'c-1' }), [{ type: 'conversation', id: 'c-1', title: 't' }]);
    const first = renderWidget({ sessionId: 'salle-1' });
    openCoach();
    fireEvent.change(field(), { target: { value: 'Que penses-tu de mon trade ?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await screen.findByText('Voici mon analyse détaillée.');
    first.unmount();

    service.getConversation.mockResolvedValue({
      conversation: { id: 'c-1' },
      messages: [
        { id: '1', role: 'user', content: 'Que penses-tu de mon trade ?', meta: {} },
        { id: '2', role: 'assistant', content: 'Voici mon analyse détaillée.', meta: { source: 'llm', toolsUsed: ['get_portfolio'], sessionId: 'salle-1', run: 1, evidence: [] } },
      ],
    });
    renderWidget({ sessionId: 'salle-1' });
    openCoach();
    expect(await screen.findByText('Voici mon analyse détaillée.')).toBeInTheDocument();
    expect(service.getConversation).toHaveBeenCalledWith('c-1');
    expect(screen.getByText('Que penses-tu de mon trade ?')).toBeInTheDocument();
    expect(screen.getByText(/A consulté : ton portefeuille/)).toBeInTheDocument();
  });

  it('« Nouvelle discussion » repart de zéro, et la suivante n’envoie plus l’ancien identifiant', async () => {
    streams(reply({ conversationId: 'c-1' }), [{ type: 'conversation', id: 'c-1', title: 't' }]);
    renderWidget({ sessionId: 'salle-1' });
    openCoach();
    fireEvent.change(field(), { target: { value: 'ancienne question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await screen.findByText(/91,8 %/);

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle discussion' }));
    expect(screen.queryByText(/91,8 %/)).not.toBeInTheDocument();
    expect(window.localStorage.getItem('alpharoom:coach:last:u1:salle-1')).toBeNull();

    streams(reply({ conversationId: 'c-2' }), [{ type: 'conversation', id: 'c-2', title: 't' }]);
    fireEvent.change(field(), { target: { value: 'sujet différent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(service.streamCoach).toHaveBeenCalledTimes(2));
    expect(service.streamCoach.mock.calls[1][0]).not.toHaveProperty('conversationId');
  });

  it('ne mélange pas les discussions de deux séances', async () => {
    streams(reply({ answer: 'Réponse de la salle 1.', conversationId: 'c-1' }), [{ type: 'conversation', id: 'c-1', title: 't' }]);
    const first = renderWidget({ sessionId: 'salle-1' });
    openCoach();
    fireEvent.change(field(), { target: { value: 'question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await screen.findByText('Réponse de la salle 1.');
    first.unmount();
    renderWidget({ sessionId: 'salle-2' });
    openCoach();
    expect(service.getConversation).not.toHaveBeenCalled();
    expect(screen.queryByText('Réponse de la salle 1.')).not.toBeInTheDocument();
  });

  it('oublie une discussion qui n’existe plus (404) et repart d’un écran vierge', async () => {
    window.localStorage.setItem('alpharoom:coach:last:u1:salle-1', 'disparue');
    service.getConversation.mockRejectedValue(Object.assign(new Error('Introuvable'), { status: 404 }));
    renderWidget({ sessionId: 'salle-1' });
    openCoach();
    await waitFor(() => expect(window.localStorage.getItem('alpharoom:coach:last:u1:salle-1')).toBeNull());
    expect(screen.getByRole('button', { name: 'Où j’en suis en ce moment ?' })).toBeInTheDocument();
  });

  describe('liste des discussions', () => {
    const conv = (id, title, extra = {}) => ({ id, title, sessionId: 'salle-1', messageCount: 4, updatedAt: '2026-11-08T10:00:00Z', ...extra });

    const openList = async (list = [conv('c-1', 'Plan sur l’or'), conv('c-2', 'Gestion du risque')]) => {
      service.listConversations.mockResolvedValue({ conversations: list });
      renderWidget({ sessionId: 'salle-1' });
      openCoach();
      fireEvent.click(screen.getByRole('button', { name: 'Mes discussions' }));
      await screen.findByText(list[0]?.title ?? 'Aucune discussion');
    };

    it('montre mes discussions avec leur date et leur taille', async () => {
      await openList();
      expect(screen.getByText('Gestion du risque')).toBeInTheDocument();
      expect(screen.getAllByText(/4 messages · séance salle-1/)).toHaveLength(2);
    });

    it('explique quand il n’y a encore rien', async () => {
      service.listConversations.mockResolvedValue({ conversations: [] });
      renderWidget({ sessionId: 'salle-1' });
      openCoach();
      fireEvent.click(screen.getByRole('button', { name: 'Mes discussions' }));
      expect(await screen.findByText(/Aucune discussion pour l’instant/)).toBeInTheDocument();
    });

    it('ouvre une discussion choisie, avec ses messages, et la retient', async () => {
      await openList();
      service.getConversation.mockResolvedValue({
        conversation: conv('c-2', 'Gestion du risque'),
        messages: [
          { id: '1', role: 'user', content: 'Combien risquer par trade ?', meta: {} },
          { id: '2', role: 'assistant', content: 'Environ 1 % de ton capital.', meta: { source: 'llm', sessionId: 'salle-1', run: 1, evidence: [] } },
        ],
      });
      fireEvent.click(screen.getByText('Gestion du risque'));
      expect(await screen.findByText('Environ 1 % de ton capital.')).toBeInTheDocument();
      expect(service.getConversation).toHaveBeenCalledWith('c-2');
      expect(window.localStorage.getItem('alpharoom:coach:last:u1:salle-1')).toBe('c-2');

      streams(reply({ conversationId: 'c-2' }));
      fireEvent.change(field(), { target: { value: 'Et pour le pétrole ?' } });
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
      await waitFor(() => expect(service.streamCoach).toHaveBeenCalledTimes(1));
      expect(service.streamCoach.mock.calls[0][0]).toMatchObject({ question: 'Et pour le pétrole ?', conversationId: 'c-2' });
    });

    it('renomme une discussion (Entrée valide)', async () => {
      await openList();
      service.renameConversation.mockResolvedValue({ conversation: { id: 'c-1', title: 'Mon plan or' } });
      fireEvent.click(screen.getByRole('button', { name: 'Renommer Plan sur l’or' }));
      const input = screen.getByLabelText('Nouveau titre');
      fireEvent.change(input, { target: { value: 'Mon plan or' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(await screen.findByText('Mon plan or')).toBeInTheDocument();
      expect(service.renameConversation).toHaveBeenCalledWith('c-1', 'Mon plan or');
    });

    it('supprime après confirmation seulement', async () => {
      await openList();
      service.deleteConversation.mockResolvedValue(null);
      fireEvent.click(screen.getByRole('button', { name: 'Supprimer Plan sur l’or' }));
      fireEvent.click(screen.getByRole('button', { name: 'Non' }));
      expect(service.deleteConversation).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Supprimer Plan sur l’or' }));
      fireEvent.click(screen.getByRole('button', { name: 'Oui' }));
      await waitFor(() => expect(screen.queryByText('Plan sur l’or')).not.toBeInTheDocument());
      expect(service.deleteConversation).toHaveBeenCalledWith('c-1');
      expect(screen.getByText('Gestion du risque')).toBeInTheDocument();
    });

    it('supprimer la discussion ouverte vide l’écran', async () => {
      streams(reply({ answer: 'Réponse à effacer.', conversationId: 'c-1' }), [{ type: 'conversation', id: 'c-1', title: 'Plan sur l’or' }]);
      service.listConversations.mockResolvedValue({ conversations: [conv('c-1', 'Plan sur l’or')] });
      service.deleteConversation.mockResolvedValue(null);
      renderWidget({ sessionId: 'salle-1' });
      openCoach();
      fireEvent.change(field(), { target: { value: 'question' } });
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
      await screen.findByText('Réponse à effacer.');
      fireEvent.click(screen.getByRole('button', { name: 'Mes discussions' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Supprimer Plan sur l’or' }));
      fireEvent.click(screen.getByRole('button', { name: 'Oui' }));
      await waitFor(() => expect(service.deleteConversation).toHaveBeenCalledWith('c-1'));
      fireEvent.click(screen.getByRole('button', { name: 'Mes discussions' }));
      expect(screen.queryByText('Réponse à effacer.')).not.toBeInTheDocument();
      expect(window.localStorage.getItem('alpharoom:coach:last:u1:salle-1')).toBeNull();
    });
  });

  it('signale les chiffres que le coach n’a pas pu vérifier', async () => {
    streams(reply({ source: 'llm', unverified: ['4 321'] }));
    renderWidget();
    openCoach();
    fireEvent.change(field(), { target: { value: 'combien ?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(await screen.findByText(/Chiffres estimés ou proposés.*4 321/)).toBeInTheDocument();
  });

  it('le bouton Stop interrompt la réponse sans perdre ce qui est déjà écrit', async () => {
    service.streamCoach.mockImplementation(
      (_payload, { onEvent, signal }) =>
        new Promise((_resolve, reject) => {
          onEvent({ type: 'delta', text: 'Début de réponse' });
          signal.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' })));
        }),
    );
    renderWidget();
    openCoach();
    fireEvent.change(field(), { target: { value: 'long' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await screen.findByText('Début de réponse');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(await screen.findByText('Réponse interrompue.')).toBeInTheDocument();
    expect(screen.getByText('Début de réponse')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument();
  });

  it('affiche l’erreur (ex. trop de questions, aucune séance)', async () => {
    service.streamCoach.mockRejectedValue(new Error('Tu ne participes à aucune séance pour le moment.'));
    renderWidget();
    openCoach();
    fireEvent.click(screen.getByRole('button', { name: 'Quand acheter ou vendre l’or ?' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('aucune séance');
  });

  it('affiche aussi les erreurs envoyées par le flux', async () => {
    service.streamCoach.mockImplementation(async (_payload, { onEvent }) => onEvent({ type: 'error', message: 'Trop de questions, patiente un instant.' }));
    renderWidget();
    openCoach();
    fireEvent.change(field(), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Trop de questions');
  });

  it('ne laisse pas envoyer une question vide et se ferme avec Échap', () => {
    renderWidget();
    openCoach();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('guide proactif', () => {
    const alert = {
      id: 'no_protection:XAU/USD:5',
      code: 'no_protection',
      severity: 'alert',
      minute: 8,
      title: 'XAU/USD : position sans stop-loss',
      message: 'Tu détiens 20 XAU/USD sans stop-loss.',
      question: 'À quoi sert un stop-loss et comment choisir son niveau ?',
    };

    it('prévient de lui-même : pastille sur le bouton puis carte d’alerte à l’ouverture', async () => {
      service.getGuideAlerts.mockResolvedValue({ alerts: [alert] });
      renderWidget({ sessionId: 'salle-1' });
      expect(await screen.findByLabelText('1 nouveau conseil')).toBeInTheDocument();
      expect(screen.getByText('XAU/USD : position sans stop-loss')).toBeInTheDocument(); // teaser

      fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le coach de trading' }));
      expect(screen.getByRole('group', { name: 'XAU/USD : position sans stop-loss' })).toBeInTheDocument();
      expect(screen.getByText('Tu détiens 20 XAU/USD sans stop-loss.')).toBeInTheDocument();
      expect(screen.queryByLabelText('1 nouveau conseil')).not.toBeInTheDocument();
    });

    it('ne répète pas une alerte déjà montrée', async () => {
      service.getGuideAlerts.mockResolvedValue({ alerts: [alert] });
      renderWidget({ sessionId: 'salle-1' });
      fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le coach de trading' }));
      await screen.findByText('Tu détiens 20 XAU/USD sans stop-loss.');
      expect(screen.getAllByText('Tu détiens 20 XAU/USD sans stop-loss.')).toHaveLength(1);
    });

    it('« En parler au coach » pose la question proposée par l’alerte', async () => {
      service.getGuideAlerts.mockResolvedValue({ alerts: [alert] });
      streams(reply({ answer: 'Un stop-loss ferme la position à un seuil fixé.', source: 'llm', agent: true, toolsUsed: ['get_portfolio', 'get_market'] }));
      renderWidget({ sessionId: 'salle-1' });
      fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le coach de trading' }));
      fireEvent.click(await screen.findByRole('button', { name: 'En parler au coach' }));
      await waitFor(() => expect(service.streamCoach).toHaveBeenCalled());
      expect(service.streamCoach.mock.calls[0][0]).toMatchObject({ question: alert.question, sessionId: 'salle-1' });
      expect(await screen.findByText('A consulté : ton portefeuille, le marché')).toBeInTheDocument();
    });

    it('donne le briefing de début à la première ouverture seulement', async () => {
      service.getGuideBriefing.mockResolvedValue({ first: true, text: 'Bienvenue dans « Le mardi de la panique ».', objectives: ['Protège ta position avec un stop-loss.'] });
      renderWidget({ sessionId: 'salle-1' });
      fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le coach de trading' }));
      expect(await screen.findByText(/Bienvenue dans « Le mardi de la panique »/)).toBeInTheDocument();
      expect(screen.getByText('Protège ta position avec un stop-loss.')).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole('button', { name: 'Fermer le coach' }).at(-1));
      fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le coach de trading' }));
      expect(service.getGuideBriefing).toHaveBeenCalledTimes(1);
    });

    it('« Mon bilan » affiche le bilan avec points forts et points à retravailler', async () => {
      service.getGuideDebrief.mockResolvedValue({
        minute: 23,
        text: 'Bilan à la minute 23 : perte de 2 835 $.',
        source: 'rules',
        strengths: ['Exposition maîtrisée.'],
        toImprove: ['Pose ton stop-loss dès l’entrée.'],
      });
      renderWidget({ sessionId: 'salle-1' });
      fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le coach de trading' }));
      fireEvent.click(screen.getByRole('button', { name: 'Mon bilan' }));
      expect(await screen.findByText('Bilan à la minute 23 : perte de 2 835 $.')).toBeInTheDocument();
      expect(screen.getByText('Ce qui a bien fonctionné')).toBeInTheDocument();
      expect(screen.getByText('Pose ton stop-loss dès l’entrée.')).toBeInTheDocument();
    });

    it('ne sonde pas le serveur sans identifiant de séance', () => {
      renderWidget();
      expect(service.getGuideAlerts).not.toHaveBeenCalled();
    });
  });
});
