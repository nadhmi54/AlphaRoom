import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Footer from './Footer.jsx';

describe('Footer', () => {
  it('affiche la navigation et les liens de compte', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Équipe' })).toHaveAttribute('href', '#team');
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/connexion');
  });

  it('affiche les logos sociaux sans aucun lien de redirection', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    ['LinkedIn', 'Instagram', 'Twitter', 'Facebook', 'Gmail'].forEach((name) => {
      expect(screen.getByRole('img', { name })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name })).toBeNull();
    });
    expect(screen.queryByText('Le projet')).toBeNull();
  });
});
