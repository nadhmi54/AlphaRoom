import { useCallback, useEffect, useState } from 'react';
import PageShell from '../../components/PageShell/PageShell.jsx';
import { useAuth } from '../../context/useAuth.js';
import { ROLES, roleLabel } from '../../data/roles.js';
import {
  changeUserRole,
  listAuditLogs,
  listUsers,
  setUserActive,
} from '../../services/userService.js';
import './AdminUsersPage.css';

const PAGE_SIZE = 15;

const ACTION_LABELS = {
  role_changed: 'Rôle modifié',
  account_disabled: 'Compte désactivé',
  account_enabled: 'Compte réactivé',
};

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function Pager({ page, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="ar-adm__pager">
      <button type="button" className="ar-ps__btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← Précédent
      </button>
      <span>
        Page {page} / {pages} · {total} résultat{total > 1 ? 's' : ''}
      </span>
      <button type="button" className="ar-ps__btn" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Suivant →
      </button>
    </div>
  );
}

function UsersTab({ currentId }) {
  const [filters, setFilters] = useState({ search: '', role: '', status: '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listUsers({
        page,
        limit: PAGE_SIZE,
        search: applied.search.trim(),
        role: applied.role,
        isActive: applied.status === '' ? undefined : applied.status === 'active',
      });
      setData(result);
      setBanner(null);
    } catch (error) {
      setBanner(error.message);
    } finally {
      setLoading(false);
    }
  }, [page, applied]);

  useEffect(() => {
    load();
  }, [load]);

  function replaceRow(updated) {
    setData((current) => ({
      ...current,
      items: current.items.map((row) => (row.id === updated.id ? updated : row)),
    }));
  }

  async function act(id, action) {
    setBusyId(id);
    setBanner(null);
    try {
      replaceRow(await action());
    } catch (error) {
      setBanner(error.message);
    } finally {
      setBusyId(null);
    }
  }

  function submit(event) {
    event.preventDefault();
    setPage(1);
    setApplied(filters);
  }

  return (
    <>
      <form className="ar-adm__filters" onSubmit={submit}>
        <input
          className="ar-ps__input"
          type="search"
          aria-label="Rechercher"
          placeholder="Rechercher (e-mail, nom, pseudo)"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
        <select
          className="ar-ps__input"
          aria-label="Filtrer par rôle"
          value={filters.role}
          onChange={(e) => setFilters({ ...filters, role: e.target.value })}
        >
          <option value="">Tous les rôles</option>
          {ROLES.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
        <select
          className="ar-ps__input"
          aria-label="Filtrer par statut"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="inactive">Désactivés</option>
        </select>
        <button type="submit" className="ar-ps__btn ar-ps__btn--primary">
          Filtrer
        </button>
      </form>

      {banner && <div className="ar-ps__banner ar-ps__banner--error">{banner}</div>}

      <div className="ar-adm__tablewrap">
        <table className="ar-adm__table">
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Dernière connexion</th>
              <th>Inscription</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.items.map((user) => {
              const isMe = user.id === currentId;
              const busy = busyId === user.id;
              return (
                <tr key={user.id}>
                  <td>
                    <strong>{user.fullName || user.username || '—'}</strong>
                    <span className="ar-adm__sub">{user.email}</span>
                  </td>
                  <td>
                    <select
                      className="ar-ps__input ar-adm__select"
                      aria-label={`Rôle de ${user.email}`}
                      value={user.role}
                      disabled={isMe || busy}
                      onChange={(e) => act(user.id, () => changeUserRole(user.id, e.target.value))}
                    >
                      {ROLES.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className={`ar-ps__chip ${user.isActive ? 'ar-ps__chip--ok' : 'ar-ps__chip--off'}`}>
                      {user.isActive ? 'Actif' : 'Désactivé'}
                    </span>
                  </td>
                  <td>{formatDate(user.lastLoginAt)}</td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="ar-ps__btn ar-ps__btn--danger"
                      disabled={isMe || busy}
                      onClick={() => act(user.id, () => setUserActive(user.id, !user.isActive))}
                    >
                      {user.isActive ? 'Désactiver' : 'Réactiver'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="ar-adm__empty">
                  Aucun utilisateur ne correspond à ces filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <p className="ar-ps__hint">Chargement…</p>}
      <Pager page={page} total={data.total} onChange={setPage} />
    </>
  );
}

function AuditTab() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    let active = true;
    listAuditLogs({ page, limit: PAGE_SIZE })
      .then((result) => active && setData(result))
      .catch((error) => active && setBanner(error.message));
    return () => {
      active = false;
    };
  }, [page]);

  function describe(entry) {
    if (entry.action === 'role_changed' && entry.details) {
      return `${roleLabel(entry.details.from)} → ${roleLabel(entry.details.to)}`;
    }
    return '';
  }

  return (
    <>
      {banner && <div className="ar-ps__banner ar-ps__banner--error">{banner}</div>}
      <div className="ar-adm__tablewrap">
        <table className="ar-adm__table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Action</th>
              <th>Par</th>
              <th>Sur</th>
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((entry) => (
              <tr key={entry.id}>
                <td>{formatDate(entry.createdAt)}</td>
                <td>{ACTION_LABELS[entry.action] ?? entry.action}</td>
                <td>{entry.actorEmail ?? entry.actorId}</td>
                <td>{entry.targetEmail ?? entry.targetId}</td>
                <td>{describe(entry)}</td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={5} className="ar-adm__empty">
                  Aucune action d&apos;administration enregistrée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={data.total} onChange={setPage} />
    </>
  );
}

export default function AdminUsersPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState('users');

  return (
    <PageShell
      wide
      title="Administration"
      subtitle="Gère les comptes, les rôles métier et consulte le journal des actions."
    >
      <div className="ar-adm__tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'users'} className={tab === 'users' ? 'is-active' : ''} onClick={() => setTab('users')}>
          Utilisateurs
        </button>
        <button type="button" role="tab" aria-selected={tab === 'audit'} className={tab === 'audit' ? 'is-active' : ''} onClick={() => setTab('audit')}>
          Journal
        </button>
      </div>
      {tab === 'users' ? <UsersTab currentId={profile?.id} /> : <AuditTab />}
    </PageShell>
  );
}
