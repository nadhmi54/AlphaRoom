import { Link, Navigate, useLocation } from 'react-router-dom';
import LoadingScreen from '../components/LoadingScreen/LoadingScreen.jsx';
import PageShell from '../components/PageShell/PageShell.jsx';
import { useAuth } from '../context/useAuth.js';

// Protège une page : redirige vers /connexion si personne n'est connecté,
// affiche un message si le rôle ne suffit pas (`roles`), si le compte est
// désactivé ou si le backend est injoignable. Le contrôle réel reste côté
// backend (@Auth) — ici c'est uniquement de l'ergonomie.
export default function ProtectedRoute({ roles, children }) {
  const { session, profile, loading, profileError, refreshProfile } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen layer="under" />;

  if (!session) {
    return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  }

  if (!profile) {
    const disabled = profileError?.status === 403;
    return (
      <PageShell title={disabled ? 'Compte désactivé' : 'Profil indisponible'}>
        <p className="ar-ps__note">
          {profileError?.message || 'Impossible de charger ton profil pour le moment.'}
        </p>
        <div className="ar-ps__actions">
          {!disabled && (
            <button type="button" className="ar-ps__btn" onClick={refreshProfile}>
              Réessayer
            </button>
          )}
          <Link to="/" className="ar-ps__btn ar-ps__btn--ghost">
            Retour à l&apos;accueil
          </Link>
        </div>
      </PageShell>
    );
  }

  if (roles && !roles.includes(profile.role)) {
    return (
      <PageShell title="Accès refusé">
        <p className="ar-ps__note">Ton rôle ne te permet pas d&apos;ouvrir cette page.</p>
        <div className="ar-ps__actions">
          <Link to="/" className="ar-ps__btn ar-ps__btn--ghost">
            Retour à l&apos;accueil
          </Link>
        </div>
      </PageShell>
    );
  }

  return children;
}
