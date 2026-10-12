import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../context/authContext.js';
import ProfilePage, { buildPayload, validateProfileForm } from './ProfilePage.jsx';

const form = { fullName: '', username: '', country: '', avatarUrl: '', language: 'fr', theme: 'dark' };

describe('validation du formulaire profil', () => {
  it('accepte un formulaire vide ou valide', () => {
    expect(validateProfileForm(form)).toEqual({});
    expect(validateProfileForm({ ...form, fullName: 'Nadhmi', username: 'Nadhmi_R', avatarUrl: 'https://x.io/a.png' })).toEqual({});
  });

  it('signale pseudo, nom et avatar invalides', () => {
    const errors = validateProfileForm({ ...form, fullName: 'N', username: 'a b', avatarUrl: 'http://x.io' });
    expect(Object.keys(errors).sort()).toEqual(['avatarUrl', 'fullName', 'username']);
  });

  it('construit le payload (vide → null, pseudo en minuscules)', () => {
    expect(buildPayload({ ...form, fullName: ' Nadhmi ', username: ' Nadhmi_R ' })).toEqual({
      fullName: 'Nadhmi',
      username: 'nadhmi_r',
      avatarUrl: null,
      country: null,
      preferences: { language: 'fr', theme: 'dark' },
    });
  });
});

describe('ProfilePage', () => {
  const profile = {
    email: 'a@b.co',
    role: 'trader',
    isActive: true,
    fullName: 'Ancien Nom',
    username: null,
    country: 'TN',
    avatarUrl: null,
    preferences: { language: 'fr', theme: 'dark' },
    createdAt: '2026-09-01T10:00:00Z',
    lastLoginAt: '2026-10-12T10:00:00Z',
  };

  function renderPage(updateProfile = vi.fn().mockResolvedValue(profile), custom = profile) {
    render(
      <AuthContext.Provider value={{ session: { user: {} }, profile: custom, updateProfile }}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    return updateProfile;
  }

  it('affiche le profil : nom, rôle, complétion, e-mail', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Ancien Nom' })).toBeInTheDocument();
    expect(screen.getAllByText('Trader').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: 'Profil complété à 50 %' })).toBeInTheDocument();
    expect(screen.getByText('a@b.co', { selector: 'dd' })).toBeInTheDocument();
  });

  it("n'affiche la barre d'enregistrement qu'en cas de modification, et Annuler restaure", () => {
    renderPage();
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Nom complet'), { target: { value: 'Autre' } });
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByLabelText('Nom complet')).toHaveValue('Ancien Nom');
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
  });

  it('enregistre via updateProfile', async () => {
    const updateProfile = vi.fn().mockResolvedValue({ ...profile, fullName: 'Nouveau' });
    renderPage(updateProfile);
    fireEvent.change(screen.getByLabelText('Nom complet'), { target: { value: 'Nouveau' } });
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.getByText('Profil enregistré.')).toBeInTheDocument());
    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'Nouveau', preferences: { language: 'en', theme: 'dark' } }),
    );
  });

  it('refuse un pseudo invalide sans appeler le backend', async () => {
    const updateProfile = renderPage();
    fireEvent.change(screen.getByLabelText('Pseudo'), { target: { value: 'a b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/3 à 30 caractères/)).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("revient aux initiales quand l'image de l'avatar est cassée", () => {
    const { container } = render(
      <AuthContext.Provider value={{ session: { user: {} }, profile: { ...profile, avatarUrl: 'https://x.io/cassee.png' } }}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    const img = container.querySelector('.ar-pf-hero img');
    fireEvent.error(img);
    expect(container.querySelector('.ar-pf-hero img')).toBeNull();
    expect(container.querySelector('.ar-pf-hero .ar-pf-avatar__initials')).toHaveTextContent('AN');
  });
});
