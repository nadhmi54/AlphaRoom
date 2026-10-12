import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/AuthLayout/AuthLayout.jsx';
import PasswordInput from '../../components/PasswordInput/PasswordInput.jsx';
import GoogleIcon from '../../components/icons/GoogleIcon.jsx';
import { signInWithEmail, signInWithGoogle } from '../../services/authService.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  function validate() {
    const next = {};
    if (!EMAIL_RE.test(email)) next.email = 'Adresse email invalide.';
    if (password.length < 1) next.password = 'Mot de passe requis.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBanner(null);
    if (!validate()) return;

    setLoading(true);
    try {
      await signInWithEmail(email, password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setBanner({ type: 'error', text: err.message || 'Connexion impossible.' });
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
      setBanner({ type: 'error', text: err.message || 'Connexion Google impossible.' });
      setGoogleLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Salle de marché"
      title="Se connecter"
      subtitle="Accède à ton compte AlphaRoom pour reprendre ta session de trading."
      footer={
        <>
          Pas encore de compte ?{' '}
          <Link to="/inscription">S&apos;inscrire</Link>
        </>
      }
    >
      {banner && <div className={`aa-banner aa-banner--${banner.type}`}>{banner.text}</div>}

      <form className="aa-form" onSubmit={handleSubmit} noValidate style={{ marginTop: banner ? 14 : 0 }}>
        <div className={`aa-field ${errors.email ? 'has-error' : ''}`}>
          <label className="aa-label" htmlFor="signin-email">Email</label>
          <input
            id="signin-email"
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
          <label className="aa-label" htmlFor="signin-password">Mot de passe</label>
          <PasswordInput
            id="signin-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
          {errors.password && <span className="aa-field-error">{errors.password}</span>}
        </div>

        <div className="aa-row">
          <label className="aa-checkbox">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Se souvenir de moi
          </label>
        </div>

        <button type="submit" className="aa-submit" disabled={loading}>
          {loading && <span className="aa-spinner" />}
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

      <div className="aa-divider">ou</div>

      <button type="button" className="aa-google-btn" onClick={handleGoogle} disabled={googleLoading}>
        <GoogleIcon />
        {googleLoading ? 'Redirection…' : 'Continuer avec Google'}
      </button>
    </AuthLayout>
  );
}
