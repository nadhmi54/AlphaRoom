import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import M1MarchePage from './M1Marche/M1MarchePage.jsx';
import M6ActuariatPage from './M6Actuariat/M6ActuariatPage.jsx';
import { MODULES } from '../../data/modules.js';

describe('Pages des modules', () => {
  it('chaque module a une route', () => {
    MODULES.forEach((module) => expect(module.path).toMatch(/^\//));
  });

  it("affiche le titre du module et un lien de retour à l'accueil", () => {
    render(
      <MemoryRouter>
        <M1MarchePage />
        <M6ActuariatPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: MODULES[0].title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: MODULES[5].title })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '← Accueil' })).toHaveLength(2);
  });
});
