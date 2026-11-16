import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/useAuth.js';
import { TRADING_ROLES } from '../../data/roles.js';
import UserMenu from '../Header/UserMenu.jsx';
import './AppBar.css';

// Barre d'application commune à toutes les pages internes : logo, navigation
// (selon le rôle) et menu du compte. Purement visuelle : les routes et les
// règles d'accès restent celles d'AppRoutes / ProtectedRoute.
function navItems(session, profile) {
  const items = [{ to: '/', label: 'Accueil', end: true }];
  const role = profile?.role;
  if (session && role && TRADING_ROLES.includes(role)) {
    items.push({ to: '/marche', label: 'Portefeuille', end: true });
    items.push({ to: '/marche/cotations', label: 'Cotations', end: true });
  }
  items.push({ to: '/game-room', label: 'Game Room', end: true });
  if (session) {
    const teacher = role === 'game_master' || role === 'admin';
    items.push({
      to: teacher ? '/ia/enseignant' : '/ia/mes-bilans',
      label: teacher ? 'IA enseignant' : 'Mes bilans IA',
      end: true,
    });
  }
  return items;
}

export default function AppBar() {
  const { session, profile } = useAuth();
  const items = navItems(session, profile);

  return (
    <header className="ar-appbar">
      <div className="ar-appbar__inner">
        <Link to="/" className="ar-appbar__brand" aria-label="Retour à l'accueil">
          <img src="/images/alpharoom-logo.png" alt="" width="34" height="34" />
          <span>AlphaRoom</span>
        </Link>

        <nav className="ar-appbar__nav" aria-label="Navigation principale">
          {items.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `ar-appbar__link ${isActive ? 'is-active' : ''}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ar-appbar__actions">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
