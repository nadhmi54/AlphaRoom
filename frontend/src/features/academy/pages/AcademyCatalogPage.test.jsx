// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../hooks/useAcademy.js', () => ({
  useAcademyCatalog: vi.fn(),
}));

const { useAcademyCatalog } = await import('../hooks/useAcademy.js');
const { default: AcademyCatalogPage } = await import('./AcademyCatalogPage.jsx');

const renderPage = () =>
  render(
    <MemoryRouter>
      <AcademyCatalogPage />
    </MemoryRouter>,
  );

const catalog = [
  {
    id: 'c1',
    title: 'Bases du marché',
    level: 1,
    isPremium: false,
    unlocked: true,
    unlockHint: null,
    summary: 'Les fondamentaux.',
    position: 1,
  },
  {
    id: 'c2',
    title: 'Options avancées',
    level: 2,
    isPremium: true,
    unlocked: false,
    unlockHint: 'Réussis le niveau 1.',
    summary: 'Stratégies avancées.',
    position: 2,
  },
];

describe('AcademyCatalogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche les cours verrouillés avec leur condition et le prochain déblocage', () => {
    useAcademyCatalog.mockReturnValue({ data: catalog, loading: false, error: '', reload: vi.fn() });

    renderPage();

    expect(screen.getByText('Bases du marché')).toBeInTheDocument();
    expect(screen.getByText('Options avancées')).toBeInTheDocument();
    expect(screen.getByText(/Condition : Réussis le niveau 1\./)).toBeInTheDocument();
    expect(screen.getByText(/Prochain déblocage : Options avancées/)).toBeInTheDocument();
    expect(screen.getByText(/1 cours débloqué sur 2/)).toBeInTheDocument();
  });

  it('affiche un état de chargement propre', () => {
    useAcademyCatalog.mockReturnValue({ data: null, loading: true, error: '', reload: vi.fn() });

    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent(/Chargement/);
  });

  it('affiche l’erreur et permet de réessayer', () => {
    const reload = vi.fn();
    useAcademyCatalog.mockReturnValue({
      data: null,
      loading: false,
      error: 'Serveur injoignable.',
      reload,
    });

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Serveur injoignable.');
    fireEvent.click(screen.getByRole('button', { name: /Réessayer/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('affiche un état vide quand le catalogue est vide', () => {
    useAcademyCatalog.mockReturnValue({ data: [], loading: false, error: '', reload: vi.fn() });

    renderPage();

    expect(screen.getByText(/Aucun cours n’est encore publié/)).toBeInTheDocument();
  });
});
