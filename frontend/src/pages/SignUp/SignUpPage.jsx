import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../../components/AuthLayout/AuthLayout.jsx';
import PasswordInput from '../../components/PasswordInput/PasswordInput.jsx';
import GoogleIcon from '../../components/icons/GoogleIcon.jsx';
import { signUpWithEmail, signInWithGoogle } from '../../services/authService.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUpPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  function validate() {
    const next = {};
    if (fullName.trim().length < 2) next.fullName = 'Nom complet requis.';
    if (!EMAIL_RE.test(email)) next.email = 'Adresse email invalide.';
    if (password.length < 8) next.password = '8 caractères minimum.';
    if (confirmPassword !== password) next.confirmPassword = 'Les mots de passe ne correspondent pas.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBanner(null);
    if (!validate()) return;

    setLoading(true);
    try {
      await signUpWithEmail(fullName.trim(), email, password);
      setBanner({
        type: 'success',
        text: 'Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse avant de te connecter.',
      });
    } catch (err) {
      setBanner({ type: 'error', text: err.message || 'Inscription impossible.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setBanner(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // signInWithOAuth redirige le navigateur vers Google — pas de suite ici.
    } catch (err) {
      setBanner({ type: 'error', text: err.message || 'Inscription Google impossible.' });
      setGoogleLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Salle de marché"
      title="Créer un compte"
      subtitle="Rejoins AlphaRoom et commence à t'entraîner sans risquer un centime."
      footer={
        <>
          Déjà un compte ?{' '}
          <Link to="/connexion">Se connecter</Link>
        </>
      }
    >
      {banner && <div className={`aa-banner aa-banner--${banner.type}`}>{banner.text}</div>}

      {banner?.type !== 'success' && (
        <>
          <form className="aa-form" onSubmit={handleSubmit} noValidate style={{ marginTop: banner ? 14 : 0 }}>
            <div className={`aa-field ${errors.fullName ? 'has-error' : ''}`}>
              <label className="aa-label" htmlFor="signup-name">Nom complet</label>
              <input
                id="signup-name"
                type="text"
                className="aa-input"
                placeholder="Ton nom"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
              {errors.fullName && <span className="aa-field-error">{errors.fullName}</span>}
            </div>

            <div className={`aa-field ${errors.email ? 'has-error' : ''}`}>
              <label className="aa-label" htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                type="email"
                className="aa-input"
                placeholder="toi@exemple.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {errors.email && <span className="aa-field-error">{errors.email}</span>}
            </div>

            <div className={`aa-field ${errors.password ? 'has-error' : ''}`}>
              <label className="aa-label" htmlFor="signup-password">Mot de passe</label>
              <PasswordInput
                id="signup-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8 caractères minimum"
                autoComplete="new-password"
              />
              {errors.password && <span className="aa-field-error">{errors.password}</span>}
            </div>

            <div className={`aa-field ${errors.confirmPassword ? 'has-error' : ''}`}>
              <label className="aa-label" htmlFor="signup-confirm">Confirmer le mot de passe</label>
              <PasswordInput
                id="signup-confirm"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
              {errors.confirmPassword && <span className="aa-field-error">{errors.confirmPassword}</span>}
            </div>

            <button type="submit" className="aa-submit" disabled={loading}>
              {loading && <span className="aa-spinner" />}
              {loading ? 'Création…' : 'Créer mon compte'}
            </button>
          </form>

          <div className="aa-divider">ou</div>

          <button type="button" className="aa-google-btn" onClick={handleGoogle} disabled={googleLoading}>
            <GoogleIcon />
            {googleLoading ? 'Redirection…' : 'Continuer avec Google'}
          </button>
        </>
      )}
    </AuthLayout>
  );
}
