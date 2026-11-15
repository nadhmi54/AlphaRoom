import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Markets from './Markets.jsx';
import { MARKET_ASSETS } from '../../data/marketAssets.js';

describe('Markets', () => {
  it('affiche un onglet par marché et la section #markets', () => {
    const { container } = render(<Markets />);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getAllByRole('tab')).toHaveLength(MARKET_ASSETS.length);
    expect(container.querySelector('#markets')).not.toBeNull();
  });

  it("affiche la crypto par défaut puis change de marché au clic", () => {
    render(<Markets />);
    expect(screen.getByRole('heading', { level: 3, name: /Crypto/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Matières premières/ }));
    expect(screen.getByRole('heading', { level: 3, name: /Matières premières/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Matières premières/ })).toHaveAttribute('aria-selected', 'true');
  });
});
