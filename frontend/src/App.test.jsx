import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

// Pas de client Supabase en test : l'app démarre en visiteur non connecté.
vi.mock('./config/supabaseClient.js', () => ({ supabase: null }));

describe('App', () => {
  it('renders the AlphaRoom title', () => {
    render(<App />);
    expect(screen.getByText('AlphaRoom')).toBeInTheDocument();
  });
});
