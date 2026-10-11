import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Markets from './Markets.jsx';
import { MARKET_ASSETS } from '../../data/marketAssets.js';

describe('Markets', () => {
  it('affiche un onglet par classe d\'actifs et la section #markets', () => {
    const { container } = render(<Markets />);
    expect(screen.getAllByRole('tab')).toHaveLength(MARKET_ASSETS.length);
    expect(container.querySelector('#markets')).not.toBeNull();
  });

  it("affiche l'or par défaut puis change d'actif au clic", () => {
    render(<Markets />);
    expect(screen.getByRole('heading', { level: 3, name: 'Or' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Pétrole/ }));
    expect(screen.getByRole('heading', { level: 3, name: 'Pétrole' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Pétrole/ })).toHaveAttribute('aria-selected', 'true');
  });
});
