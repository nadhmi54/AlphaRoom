import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
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
});
