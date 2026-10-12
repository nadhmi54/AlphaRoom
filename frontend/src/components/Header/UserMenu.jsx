import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth.js';
import { roleLabel } from '../../data/roles.js';
import { initialsOf } from '../../utils/initials.js';

// Icône utilisateur de la barre de navigation : ouvre un petit menu pour
// choisir entre se connecter et créer un compte.
export default function UserMenu() {
  const { session, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [brokenAvatar, setBrokenAvatar] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (session) {
    const displayName = profile?.fullName || profile?.username || session.user?.email || 'Mon compte';
    const initials = initialsOf(displayName);

    const handleSignOut = async () => {
      setOpen(false);
      await signOut();
      navigate('/');
    };

    return (
      <div className="ar-usermenu" ref={rootRef}>
        <button
          type="button"
          className={`ar-nav__user ar-nav__user--signed ${open ? 'is-open' : ''}`}
          aria-label="Compte"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {profile?.avatarUrl && profile.avatarUrl !== brokenAvatar ? (
            <img
              className="ar-usermenu__avatar"
              src={profile.avatarUrl}
              alt=""
              onError={() => setBrokenAvatar(profile.avatarUrl)}
            />
          ) : (
            <span className="ar-usermenu__initials" aria-hidden="true">
              {initials}
            </span>
          )}
        </button>

        {open && (
          <div className="ar-usermenu__panel" role="menu" aria-label="Compte">
            <div className="ar-usermenu__who">
              <strong>{displayName}</strong>
              {profile && <span>{roleLabel(profile.role)}</span>}
            </div>
            <Link to="/profil" className="ar-usermenu__item" role="menuitem" onClick={() => setOpen(false)}>
              Mon profil
            </Link>
            {profile?.role === 'admin' && (
              <Link to="/admin/utilisateurs" className="ar-usermenu__item" role="menuitem" onClick={() => setOpen(false)}>
                Administration
              </Link>
            )}
            <button type="button" className="ar-usermenu__item ar-usermenu__item--button" role="menuitem" onClick={handleSignOut}>
              Se déconnecter
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ar-usermenu" ref={rootRef}>
      <button
        type="button"
        className={`ar-nav__user ${open ? 'is-open' : ''}`}
        aria-label="Compte"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
        </svg>
      </button>

      {open && (
        <div className="ar-usermenu__panel" role="menu" aria-label="Compte">
          <Link to="/connexion" className="ar-usermenu__item" role="menuitem" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
            </svg>
            Se connecter
          </Link>
          <Link to="/inscription" className="ar-usermenu__item ar-usermenu__item--accent" role="menuitem" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M19 8v6" />
              <path d="M22 11h-6" />
            </svg>
            S&apos;inscrire
          </Link>
        </div>
      )}
    </div>
  );
}
