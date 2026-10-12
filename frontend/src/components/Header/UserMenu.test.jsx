import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../context/authContext.js';
import UserMenu from './UserMenu.jsx';

describe('UserMenu', () => {
  it('propose connexion et inscription au clic sur l\'icône', () => {
    render(
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Compte' }));
    expect(screen.getByRole('menuitem', { name: 'Se connecter' })).toHaveAttribute('href', '/connexion');
    expect(screen.getByRole('menuitem', { name: "S'inscrire" })).toHaveAttribute('href', '/inscription');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  function renderSignedIn(profile, signOut = async () => {}) {
    return render(
      <AuthContext.Provider value={{ session: { user: { email: 'a@b.co' } }, profile, signOut }}>
        <MemoryRouter>
          <UserMenu />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
  }

  it('connecté : initiales, profil et déconnexion (pas de connexion/inscription)', () => {
    const signOut = vi.fn().mockResolvedValue();
    renderSignedIn({ fullName: 'Nadhmi Rouissi', role: 'trader' }, signOut);
    expect(screen.getByText('NR')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Compte' }));
    expect(screen.getByRole('menuitem', { name: 'Mon profil' })).toHaveAttribute('href', '/profil');
    expect(screen.queryByRole('menuitem', { name: 'Administration' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Se connecter' })).toBeNull();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Se déconnecter' }));
    expect(signOut).toHaveBeenCalled();
  });

  it("connecté en admin : lien Administration", () => {
    renderSignedIn({ fullName: 'Admin', role: 'admin' });
    fireEvent.click(screen.getByRole('button', { name: 'Compte' }));
    expect(screen.getByRole('menuitem', { name: 'Administration' })).toHaveAttribute('href', '/admin/utilisateurs');
  });

  it("affiche les initiales si l'image d'avatar ne se charge pas", () => {
    const { container } = renderSignedIn({ fullName: 'Nadhmi Rouissi', role: 'trader', avatarUrl: 'https://x.io/cassee.png' });
    fireEvent.error(container.querySelector('img.ar-usermenu__avatar'));
    expect(container.querySelector('img.ar-usermenu__avatar')).toBeNull();
    expect(screen.getByText('NR')).toBeInTheDocument();
  });
});
