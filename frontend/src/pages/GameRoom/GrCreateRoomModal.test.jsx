// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GrCreateRoomModal from './GrCreateRoomModal.jsx';
import { createGameRoom, previewCsv } from '../../services/gameRoomService.js';

vi.mock('../../services/gameRoomService.js', () => ({
  createGameRoom: vi.fn().mockResolvedValue({ id: 'room-1', name: 'Séance krach', joinCode: 'KRAK01' }),
  previewCsv: vi.fn(),
}));

const clickNext = () => fireEvent.click(screen.getByRole('button', { name: /Continuer/i }));

describe('GrCreateRoomModal', () => {
  beforeEach(() => {
    createGameRoom.mockClear();
    previewCsv.mockClear();
  });

  it('refuse de créer une salle sans nom', async () => {
    render(<GrCreateRoomModal onClose={vi.fn()} onCreated={vi.fn()} />);

    clickNext();

    expect(await screen.findByText(/nom de la salle est obligatoire/i)).toBeInTheDocument();
    expect(createGameRoom).not.toHaveBeenCalled();
  });

  it('crée une salle en marché synthétique avec la configuration complète', async () => {
    const onCreated = vi.fn();
    render(<GrCreateRoomModal onClose={vi.fn()} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText(/Nom de la salle/i), {
      target: { value: 'Séance krach' },
    });
    // Deux actifs négociables + capital personnalisé
    fireEvent.click(screen.getByRole('button', { name: /BTC\/USD/i }));
    fireEvent.change(screen.getByLabelText(/Capital initial/i), { target: { value: '50000' } });

    clickNext();
    fireEvent.click(screen.getByRole('button', { name: /Marché synthétique/i }));
    fireEvent.change(screen.getByLabelText(/Volatilité/i), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText(/Tendance sur la séance/i), { target: { value: '-4' } });
    clickNext();

    // Durée réelle de 5 min, bougies 5m
    fireEvent.click(screen.getByRole('button', { name: '5 min' }));
    fireEvent.change(screen.getByLabelText(/Unité de temps des bougies/i), { target: { value: '5m' } });
    clickNext();

    fireEvent.change(screen.getByLabelText(/Commission/i), { target: { value: '0.2' } });
    fireEvent.change(screen.getByLabelText(/Effet de levier/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/Risque max/i), { target: { value: '2' } });
    fireEvent.click(screen.getByLabelText(/Autoriser la vente à découvert/i));

    // Le bouton final reste inactif 500 ms après l'arrivée à l'étape 4
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Créer la salle/i })).not.toBeDisabled(),
    );

    fireEvent.submit(screen.getByRole('button', { name: /Créer la salle/i }).closest('form'));

    await waitFor(() => expect(createGameRoom).toHaveBeenCalledTimes(1));

    expect(createGameRoom).toHaveBeenCalledWith({
      name: 'Séance krach',
      config: {
        assets: ['XAU/USD', 'BTC/USD'],
        maxParticipants: 30,
        initialCapital: 50000,
        currency: 'USD',
        spreadMultiplier: 1,
        commissionPercent: 0.2,
        leverage: 10,
        allowShortSelling: true,
        riskLimitPercent: 2,
      },
      source: {
        mode: 'synthetic',
        symbol: 'XAU/USD',
        initialPrice: 2685.4,
        volatilityPercent: 6,
        trendPercent: -4,
        seed: 20261101,
      },
      time: { durationMinutes: 5, timeframe: '5m' },
    });

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it('calcule automatiquement la vitesse de relecture des données historiques', async () => {
    render(<GrCreateRoomModal onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Nom de la salle/i), { target: { value: 'Replay 24 h' } });
    clickNext();
    fireEvent.click(screen.getByRole('button', { name: /Données historiques/i }));
    clickNext();

    // 24 h (86 400 s) rejouées en 30 min réelles ⇒ x48
    expect(screen.getByText('x48')).toBeInTheDocument();
    expect(
      screen.getByText(/24 h de marché rejouées en 30 min réelles, bougies 1m/),
    ).toBeInTheDocument();
  });

  it('bloque le mode CSV tant que le fichier n’a pas été validé par le serveur', async () => {
    render(<GrCreateRoomModal onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Nom de la salle/i), { target: { value: 'Import CSV' } });
    clickNext();
    fireEvent.click(screen.getByRole('button', { name: /Historique CSV/i }));
    clickNext();

    expect(await screen.findByText(/Importez et validez un fichier CSV/i)).toBeInTheDocument();
    expect(createGameRoom).not.toHaveBeenCalled();
  });

  it('neutralise Entrée partout : la création ne part que d’un clic sur le bouton', () => {
    render(<GrCreateRoomModal onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Nom de la salle/i), { target: { value: 'Salle Entrée' } });
    clickNext();
    fireEvent.click(screen.getByRole('button', { name: /Marché synthétique/i }));
    clickNext();

    // fireEvent renvoie false si preventDefault a été appelé : la soumission
    // implicite du navigateur (Entrée dans le seul champ texte) est neutralisée.
    expect(fireEvent.keyDown(screen.getByLabelText(/Vitesse de relecture/i), { key: 'Enter' })).toBe(false);
    expect(createGameRoom).not.toHaveBeenCalled();

    clickNext();
    // À l’étape 4 non plus, Entrée dans un champ ne crée pas la salle.
    expect(fireEvent.keyDown(screen.getByLabelText(/Commission/i), { key: 'Enter' })).toBe(false);
    expect(createGameRoom).not.toHaveBeenCalled();
  });

  it('absorbe le double-clic sur Continuer : créer reste inactif 500 ms à l’étape 4', async () => {
    render(<GrCreateRoomModal onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Nom de la salle/i), { target: { value: 'Double clic' } });
    clickNext();
    clickNext();
    clickNext();

    const createButton = screen.getByRole('button', { name: /Créer la salle/i });
    expect(createButton).toBeDisabled();
    fireEvent.click(createButton);
    fireEvent.submit(createButton.closest('form'));
    expect(createGameRoom).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Créer la salle/i })).not.toBeDisabled(),
    );
  });
});
