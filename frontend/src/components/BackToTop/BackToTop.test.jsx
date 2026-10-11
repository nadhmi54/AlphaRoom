import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BackToTop from './BackToTop.jsx';

describe('BackToTop', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.scrollY = 0;
  });

  it('apparaît après un défilement et ramène en haut au clic', () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo;
    render(<BackToTop />);
    const button = screen.getByRole('button', { name: 'Retour en haut de la page' });
    expect(button).not.toHaveClass('is-visible');

    window.scrollY = 900;
    fireEvent.scroll(window);
    expect(button).toHaveClass('is-visible');

    fireEvent.click(button);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });
});
