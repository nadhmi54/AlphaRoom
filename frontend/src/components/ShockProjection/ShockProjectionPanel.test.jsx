import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShockProjectionPanel from './ShockProjectionPanel.jsx';
import { getAiShockProjection } from '../../services/gameRoomService.js';

vi.mock('../../services/gameRoomService.js', () => ({ getAiShockProjection: vi.fn() }));

const projection = (overrides = {}) => ({
  actif: 'XAU/USD',
  choc: { id: 'ev-1', minute: 11, type: 'price_shock', titre: 'Choc de prix', prix_avant: 2700, prix_apres: 2619, variation_pct: -3, minutes_ecoulees: 3, recent: true },
  minute_actuelle: 14,
  prix_actuel: 2619,
  horizon_minutes: 3,
  historique: [{ minute: 10, prix: 2700 }, { minute: 11, prix: 2625 }, { minute: 12, prix: 2620 }, { minute: 13, prix: 2622 }, { minute: 14, prix: 2619 }],
  volatilite: { avant_choc_par_minute_pct: 0.1, apres_choc_par_minute_pct: 0.2, utilisee_au_depart_par_minute_pct: 0.75 },
  eventail: [14, 15, 16, 17].map((minute, i) => ({
    minute,
    bas_5: 2619 - i * 20,
    bas_25: 2619 - i * 8,
    median: 2619,
    haut_75: 2619 + i * 8,
    haut_95: 2619 + i * 20,
  })),
  scenarios: [
    { id: 'retour', titre: 'Retour au niveau d’avant', description: '…', niveau_cible: 2700, variation_vs_prix_actuel_pct: 3.1, trajectoire: [{ minute: 14, prix: 2619 }, { minute: 17, prix: 2700 }] },
    { id: 'rebond_partiel', titre: 'Rebond partiel', description: '…', niveau_cible: 2659.5, variation_vs_prix_actuel_pct: 1.5, trajectoire: [{ minute: 14, prix: 2619 }, { minute: 17, prix: 2659.5 }] },
    { id: 'continuation', titre: 'Continuation', description: '…', niveau_cible: 2578.5, variation_vs_prix_actuel_pct: -1.5, trajectoire: [{ minute: 14, prix: 2619 }, { minute: 17, prix: 2578.5 }] },
  ],
  probabilites: { repasse_par_le_niveau_d_avant_pct: 12.5, finit_au_dessus_du_prix_actuel_pct: 49, finit_sous_le_prix_actuel_pct: 51 },
  avertissement: 'Ce sont des scénarios et une fourchette, pas une prévision : personne ne sait où ira le prix.',
  ...overrides,
});

describe('ShockProjectionPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getAiShockProjection).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  const renderPanel = async () => {
    render(<ShockProjectionPanel roomId="room-1" />);
    await act(async () => {});
  };

  it('ne montre rien tant qu’aucun choc n’a eu lieu', async () => {
    vi.mocked(getAiShockProjection).mockResolvedValue({ projection: null, text: null });
    await renderPanel();
    expect(getAiShockProjection).toHaveBeenCalledWith('room-1');
    expect(screen.queryByRole('region', { name: /projection ia/i })).not.toBeInTheDocument();
  });

  it('s’ouvre tout seul sur un choc récent : fourchette, scénarios, probabilités et avertissement', async () => {
    vi.mocked(getAiShockProjection).mockResolvedValue({ projection: projection(), text: 'x' });
    await renderPanel();
    expect(screen.getByText(/choc récent/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /éventail des trajectoires possibles de xau\/usd/i })).toBeInTheDocument();
    expect(screen.getByText(/« Choc de prix »/)).toBeInTheDocument();
    expect(screen.getByText(/Retour au niveau d’avant \(vers/)).toBeInTheDocument();
    expect(screen.getByText(/Rebond partiel/)).toBeInTheDocument();
    expect(screen.getByText(/Continuation du choc/)).toBeInTheDocument();
    expect(screen.getByText('12,5 %')).toBeInTheDocument();
    expect(screen.getByText('maintenant')).toBeInTheDocument();
    expect(screen.getByText(/pas une prévision/)).toBeInTheDocument();
  });

  it('un ancien choc reste replié jusqu’à ce qu’on l’ouvre', async () => {
    vi.mocked(getAiShockProjection).mockResolvedValue({ projection: projection({ choc: { ...projection().choc, recent: false } }), text: 'x' });
    await renderPanel();
    expect(screen.getByText(/dernier choc/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /après le choc/i }));
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('montre l’effet sur la position de l’étudiant et le risque que son stop soit touché', async () => {
    const ta_position = { quantite: 20, valeur: 52380, gain_perte_si_bas_5: -1200, gain_perte_si_haut_95: 1100, stop_loss: 2600, probabilite_stop_touche_pct: 31.4 };
    vi.mocked(getAiShockProjection).mockResolvedValue({ projection: projection({ ta_position }), text: 'x' });
    await renderPanel();
    expect(screen.getByText(/sur ta position/i)).toBeInTheDocument();
    expect(screen.getByText(/ton stop-loss à 2 600 a 31,4 %/i)).toBeInTheDocument();
    expect(screen.getByText('ton stop-loss')).toBeInTheDocument();
  });

  it('dit qu’il n’y a pas de stop-loss quand la position n’est pas protégée', async () => {
    const ta_position = { quantite: 20, valeur: 52380, gain_perte_si_bas_5: -1200, gain_perte_si_haut_95: 1100, stop_loss: null, probabilite_stop_touche_pct: null };
    vi.mocked(getAiShockProjection).mockResolvedValue({ projection: projection({ ta_position }), text: 'x' });
    await renderPanel();
    expect(screen.getByText(/pas de stop-loss sur cette position/i)).toBeInTheDocument();
  });

  it('se met à jour toute seule et s’ouvre sur un nouveau choc', async () => {
    vi.mocked(getAiShockProjection).mockResolvedValueOnce({ projection: null, text: null }).mockResolvedValue({ projection: projection(), text: 'x' });
    await renderPanel();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('affiche l’erreur du serveur sans casser la page', async () => {
    vi.mocked(getAiShockProjection).mockRejectedValue(new Error('Salle introuvable.'));
    await renderPanel();
    expect(screen.getByRole('alert')).toHaveTextContent('Salle introuvable.');
  });

  it('affiche tous les chocs survenus et permet de basculer de l’un à l’autre', async () => {
    const shocks = [
      { id: 'ev-1', minute: 2.8, type: 'price_shock', label: 'Choc de prix (-3%)' },
      { id: 'ev-2', minute: 8.5, type: 'spread_shock', label: 'Choc de spread (x4)' },
    ];
    vi.mocked(getAiShockProjection).mockResolvedValue({
      projection: projection({ choc: { id: 'ev-2', minute: 8.5, type: 'spread_shock', titre: 'Choc de spread (x4)', variation_pct: 0, recent: true } }),
      shocks,
      text: 'x',
    });
    await renderPanel();
    expect(screen.getByText(/Choc 2 \/ 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Choc de prix \(-3%\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Choc de spread \(x4\)/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Dernier')).toBeInTheDocument();

    // Cliquer sur le premier choc
    fireEvent.click(screen.getByText(/Choc de prix \(-3%\)/i));
    expect(getAiShockProjection).toHaveBeenCalledWith('room-1', 'ev-1');
  });
});
