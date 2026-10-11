import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RouteLoader from './RouteLoader.jsx';

function Harness() {
  const navigate = useNavigate();
  return (
    <>
      <RouteLoader />
      <Routes>
        <Route path="/" element={<button onClick={() => navigate('/marche')}>aller</button>} />
        <Route path="/marche" element={<p>page marché</p>} />
      </Routes>
    </>
  );
}

describe('RouteLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.scrollTo = vi.fn();
  });
  afterEach(() => vi.useRealTimers());

  it("affiche l'écran de chargement seulement lors d'un changement de page", () => {
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('status')).toBeNull();

    act(() => screen.getByText('aller').click());
    expect(screen.getByRole('status', { name: 'Chargement en cours' })).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);

    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
