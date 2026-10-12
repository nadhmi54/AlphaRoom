import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthContext } from '../context/authContext.js';
import ProtectedRoute from './ProtectedRoute.jsx';

const base = {
  session: null,
  profile: null,
  loading: false,
  profileError: null,
  refreshProfile: async () => {},
  updateProfile: async () => {},
  signOut: async () => {},
};

function renderAt(value, roles) {
  return render(
    <AuthContext.Provider value={{ ...base, ...value }}>
      <MemoryRouter initialEntries={['/secret']}>
        <Routes>
          <Route path="/connexion" element={<div>page connexion</div>} />
          <Route
            path="/secret"
            element={
              <ProtectedRoute roles={roles}>
                <div>contenu secret</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('ProtectedRoute', () => {
  it('redirige vers /connexion sans session', () => {
    renderAt({});
    expect(screen.getByText('page connexion')).toBeInTheDocument();
  });

  it('affiche le contenu pour un utilisateur connecté', () => {
    renderAt({ session: { user: { id: 'u' } }, profile: { role: 'trader' } });
    expect(screen.getByText('contenu secret')).toBeInTheDocument();
  });

  it('refuse un rôle insuffisant', () => {
    renderAt({ session: { user: { id: 'u' } }, profile: { role: 'trader' } }, ['admin']);
    expect(screen.getByText('Accès refusé')).toBeInTheDocument();
    expect(screen.queryByText('contenu secret')).toBeNull();
  });

  it('autorise le bon rôle', () => {
    renderAt({ session: { user: { id: 'u' } }, profile: { role: 'admin' } }, ['admin']);
    expect(screen.getByText('contenu secret')).toBeInTheDocument();
  });

  it('explique un compte désactivé', () => {
    renderAt({
      session: { user: { id: 'u' } },
      profileError: { status: 403, message: 'Ce compte a été désactivé.' },
    });
    expect(screen.getByText('Compte désactivé')).toBeInTheDocument();
  });
});
