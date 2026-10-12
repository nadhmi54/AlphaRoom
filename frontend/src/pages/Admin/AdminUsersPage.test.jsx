import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../context/authContext.js';

vi.mock('../../services/userService.js', () => ({
  listUsers: vi.fn(),
  changeUserRole: vi.fn(),
  setUserActive: vi.fn(),
  listAuditLogs: vi.fn(),
}));

const service = await import('../../services/userService.js');
const { default: AdminUsersPage } = await import('./AdminUsersPage.jsx');

const me = { id: 'me', email: 'admin@alpharoom.test', fullName: 'Admin', role: 'admin', isActive: true };
const bob = { id: 'bob', email: 'bob@alpharoom.test', fullName: 'Bob', role: 'trader', isActive: true };

function renderPage() {
  return render(
    <AuthContext.Provider value={{ session: { user: {} }, profile: me }}>
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('AdminUsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.listUsers.mockResolvedValue({ items: [me, bob], total: 2, page: 1, limit: 15 });
  });

  it('liste les utilisateurs et verrouille ses propres contrôles', async () => {
    renderPage();
    expect(await screen.findByText('bob@alpharoom.test')).toBeInTheDocument();
    expect(screen.getByLabelText('Rôle de admin@alpharoom.test')).toBeDisabled();
    expect(screen.getByLabelText('Rôle de bob@alpharoom.test')).not.toBeDisabled();
  });

  it('change le rôle et désactive un compte', async () => {
    service.changeUserRole.mockResolvedValue({ ...bob, role: 'analyst' });
    service.setUserActive.mockResolvedValue({ ...bob, role: 'analyst', isActive: false });
    renderPage();
    await screen.findByText('bob@alpharoom.test');

    fireEvent.change(screen.getByLabelText('Rôle de bob@alpharoom.test'), { target: { value: 'analyst' } });
    await waitFor(() => expect(service.changeUserRole).toHaveBeenCalledWith('bob', 'analyst'));
    await waitFor(() => expect(screen.getByLabelText('Rôle de bob@alpharoom.test')).toHaveValue('analyst'));

    const buttons = screen.getAllByRole('button', { name: 'Désactiver' });
    fireEvent.click(buttons[1]);
    await waitFor(() => expect(service.setUserActive).toHaveBeenCalledWith('bob', false));
    expect(await screen.findByText('Désactivé')).toBeInTheDocument();
  });

  it("affiche l'erreur du backend", async () => {
    service.changeUserRole.mockRejectedValue(new Error('Il doit rester au moins un administrateur actif.'));
    renderPage();
    await screen.findByText('bob@alpharoom.test');
    fireEvent.change(screen.getByLabelText('Rôle de bob@alpharoom.test'), { target: { value: 'admin' } });
    expect(await screen.findByText(/au moins un administrateur/)).toBeInTheDocument();
  });

  it('affiche le journal avec les e-mails', async () => {
    service.listAuditLogs.mockResolvedValue({
      items: [
        { id: 'l1', action: 'role_changed', actorEmail: 'admin@alpharoom.test', targetEmail: 'bob@alpharoom.test', details: { from: 'trader', to: 'analyst' }, createdAt: '2026-10-12T10:00:00Z' },
      ],
      total: 1,
    });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText('Trader → Analyste')).toBeInTheDocument();
    expect(screen.getByText('Rôle modifié')).toBeInTheDocument();
  });
});
