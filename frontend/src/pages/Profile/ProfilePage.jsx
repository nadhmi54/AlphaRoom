import { useEffect, useState } from 'react';
import PageShell from '../../components/PageShell/PageShell.jsx';
import { useAuth } from '../../context/useAuth.js';
import { COUNTRIES, ROLE_INFO, roleLabel } from '../../data/roles.js';
import { initialsOf } from '../../utils/initials.js';
import './ProfilePage.css';

const USERNAME_RE = /^[a-z0-9_.-]{3,30}$/;

function toForm(profile) {
  return {
    fullName: profile.fullName ?? '',
    username: profile.username ?? '',
    country: profile.country ?? '',
    avatarUrl: profile.avatarUrl ?? '',
    language: profile.preferences?.language ?? 'fr',
    theme: profile.preferences?.theme ?? 'dark',
  };
}

export function validateProfileForm(form) {
  const errors = {};
  const name = form.fullName.trim();
  if (name && (name.length < 2 || name.length > 80)) {
    errors.fullName = 'Le nom doit contenir entre 2 et 80 caractères.';
  }
  const username = form.username.trim().toLowerCase();
  if (username && !USERNAME_RE.test(username)) {
    errors.username = '3 à 30 caractères : lettres minuscules, chiffres, « . », « _ » ou « - ».';
  }
  const avatar = form.avatarUrl.trim();
  if (avatar && !/^https:\/\/\S+$/.test(avatar)) {
    errors.avatarUrl = "L'adresse de l'avatar doit commencer par https://";
  }
  return errors;
}

// Les champs vides deviennent `null` (efface la valeur côté backend).
export function buildPayload(form) {
  const name = form.fullName.trim();
  return {
    ...(name ? { fullName: name } : {}),
    username: form.username.trim().toLowerCase() || null,
    avatarUrl: form.avatarUrl.trim() || null,
    country: form.country || null,
    preferences: { language: form.language, theme: form.theme },
  };
}

function completion(profile) {
  const checks = [profile.fullName, profile.username, profile.country, profile.avatarUrl];
  const done = checks.filter(Boolean).length;
  return { done, total: checks.length, percent: Math.round((done / checks.length) * 100) };
}

const formatDate = (value, options) =>
  value ? new Date(value).toLocaleDateString('fr-FR', options) : '—';

function Icon({ children }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

// Photo de profil ; revient aux initiales si l'image ne se charge pas.
function Avatar({ url, label, size = 'md' }) {
  const [broken, setBroken] = useState(null);
  const showImage = url && url !== broken;
  return (
    <span className={`ar-pf-avatar ar-pf-avatar--${size}`}>
      {showImage ? (
        <img className="ar-pf-avatar__img" src={url} alt="" onError={() => setBroken(url)} />
      ) : (
        <span className="ar-pf-avatar__initials" aria-hidden="true">
          {initialsOf(label)}
        </span>
      )}
    </span>
  );
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="ar-pf-seg" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={value === option.value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function CompletionRing({ percent }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="ar-pf-ring" role="img" aria-label={`Profil complété à ${percent} %`}>
      <svg viewBox="0 0 80 80" width="84" height="84">
        <circle cx="40" cy="40" r={radius} className="ar-pf-ring__track" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          className="ar-pf-ring__value"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <span className="ar-pf-ring__label">{percent}%</span>
    </div>
  );
}

function ProfileView({ profile, email }) {
  const { updateProfile } = useAuth();
  const [form, setForm] = useState(() => toForm(profile));
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [saving, setSaving] = useState(false);

  const saved = toForm(profile);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const role = ROLE_INFO[profile.role] ?? { accent: '#d9b877', description: '' };
  const progress = completion(profile);
  const displayName = profile.fullName || profile.username || email;

  useEffect(() => {
    if (banner?.type !== 'success') return undefined;
    const timer = setTimeout(() => setBanner(null), 4000);
    return () => clearTimeout(timer);
  }, [banner]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const setValue = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setBanner(null);
    const found = validateProfileForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const updated = await updateProfile(buildPayload(form));
      setForm(toForm(updated));
      setBanner({ type: 'success', text: 'Profil enregistré.' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Enregistrement impossible.' });
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setForm(saved);
    setErrors({});
    setBanner(null);
  }

  const previewUrl = /^https:\/\/\S+$/.test(form.avatarUrl.trim()) ? form.avatarUrl.trim() : '';

  return (
    <div className="ar-pf" style={{ '--role': role.accent }}>
      <section className="ar-pf-hero">
        <div className="ar-pf-hero__glow" aria-hidden="true" />
        <Avatar url={profile.avatarUrl} label={displayName} size="xl" />
        <div className="ar-pf-hero__id">
          <span className="ar-pf-eyebrow">Mon profil</span>
          <h1 className="ar-pf-hero__name">{displayName}</h1>
          <p className="ar-pf-hero__meta">
            {profile.username && <span>@{profile.username}</span>}
            <span>{email}</span>
          </p>
          <div className="ar-pf-hero__chips">
            <span className="ar-pf-role">{roleLabel(profile.role)}</span>
            <span className={`ar-pf-status ${profile.isActive ? '' : 'is-off'}`}>
              {profile.isActive ? 'Compte actif' : 'Compte désactivé'}
            </span>
          </div>
        </div>
        <div className="ar-pf-hero__progress">
          <CompletionRing percent={progress.percent} />
          <div className="ar-pf-hero__progress-text">
            <strong>Profil complété</strong>
            <span>
              {progress.done} sur {progress.total} informations renseignées
            </span>
          </div>
        </div>
      </section>

      {banner && (
        <div className={`ar-pf-banner ar-pf-banner--${banner.type}`} role="status">
          {banner.text}
        </div>
      )}

      <div className="ar-pf-grid">
        <form id="profile-form" className="ar-pf-main" onSubmit={handleSubmit} noValidate>
          <section className="ar-pf-card">
            <header className="ar-pf-card__head">
              <span className="ar-pf-card__icon">
                <Icon>
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
                </Icon>
              </span>
              <div>
                <h2>Informations personnelles</h2>
                <p>Ces informations sont visibles par les administrateurs de la salle de marché.</p>
              </div>
            </header>

            <div className="ar-pf-fields">
              <div className="ar-pf-field">
                <label htmlFor="pf-name">Nom complet</label>
                <input id="pf-name" className="ar-pf-input" value={form.fullName} onChange={set('fullName')} maxLength={80} placeholder="Prénom Nom" autoComplete="name" />
                <div className="ar-pf-field__foot">
                  {errors.fullName ? <span className="ar-pf-error">{errors.fullName}</span> : <span />}
                  <span className="ar-pf-count">{form.fullName.length}/80</span>
                </div>
              </div>

              <div className="ar-pf-field">
                <label htmlFor="pf-username">Pseudo</label>
                <div className="ar-pf-prefix">
                  <span aria-hidden="true">@</span>
                  <input id="pf-username" className="ar-pf-input" value={form.username} onChange={set('username')} maxLength={30} placeholder="nadhmi.r" autoComplete="username" />
                </div>
                <div className="ar-pf-field__foot">
                  {errors.username ? (
                    <span className="ar-pf-error">{errors.username}</span>
                  ) : (
                    <span className="ar-pf-hint">Unique, en minuscules.</span>
                  )}
                </div>
              </div>

              <div className="ar-pf-field">
                <label htmlFor="pf-country">Pays</label>
                <select id="pf-country" className="ar-pf-input" value={form.country} onChange={set('country')}>
                  <option value="">Non précisé</option>
                  {COUNTRIES.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="ar-pf-card">
            <header className="ar-pf-card__head">
              <span className="ar-pf-card__icon">
                <Icon>
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </Icon>
              </span>
              <div>
                <h2>Photo de profil</h2>
                <p>Colle l&apos;adresse directe d&apos;une image (https). Sans photo, tes initiales sont affichées.</p>
              </div>
            </header>

            <div className="ar-pf-avatar-row">
              <Avatar url={previewUrl} label={displayName} size="lg" />
              <div className="ar-pf-field ar-pf-avatar-row__field">
                <label htmlFor="pf-avatar">Adresse de l&apos;image</label>
                <input id="pf-avatar" className="ar-pf-input" value={form.avatarUrl} onChange={set('avatarUrl')} maxLength={500} placeholder="https://i.imgur.com/…" inputMode="url" />
                <div className="ar-pf-field__foot">
                  {errors.avatarUrl ? <span className="ar-pf-error">{errors.avatarUrl}</span> : <span />}
                  {form.avatarUrl && (
                    <button type="button" className="ar-pf-link" onClick={() => setForm((current) => ({ ...current, avatarUrl: '' }))}>
                      Retirer la photo
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="ar-pf-card">
            <header className="ar-pf-card__head">
              <span className="ar-pf-card__icon">
                <Icon>
                  <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
                </Icon>
              </span>
              <div>
                <h2>Préférences</h2>
                <p>Enregistrées sur ton compte ; les modules les appliqueront au fur et à mesure.</p>
              </div>
            </header>

            <div className="ar-pf-prefs">
              <div className="ar-pf-pref">
                <span className="ar-pf-pref__label">Langue</span>
                <Segmented
                  label="Langue"
                  value={form.language}
                  onChange={setValue('language')}
                  options={[
                    { value: 'fr', label: 'Français' },
                    { value: 'en', label: 'English' },
                  ]}
                />
              </div>
              <div className="ar-pf-pref">
                <span className="ar-pf-pref__label">Thème</span>
                <Segmented
                  label="Thème"
                  value={form.theme}
                  onChange={setValue('theme')}
                  options={[
                    { value: 'dark', label: 'Sombre' },
                    { value: 'light', label: 'Clair' },
                  ]}
                />
              </div>
            </div>
          </section>
        </form>

        <aside className="ar-pf-side">
          <section className="ar-pf-card ar-pf-card--role">
            <header className="ar-pf-card__head">
              <span className="ar-pf-card__icon ar-pf-card__icon--role">
                <Icon>
                  <path d="M12 3l8 3v6c0 5-3.4 8.3-8 9-4.6-.7-8-4-8-9V6l8-3z" />
                  <path d="M9 12l2 2 4-4" />
                </Icon>
              </span>
              <div>
                <h2>Rôle et accès</h2>
              </div>
            </header>
            <span className="ar-pf-role ar-pf-role--lg">{roleLabel(profile.role)}</span>
            <p className="ar-pf-role__desc">{role.description}</p>
            <p className="ar-pf-hint">Le rôle est attribué par un administrateur.</p>
          </section>

          <section className="ar-pf-card">
            <header className="ar-pf-card__head">
              <span className="ar-pf-card__icon">
                <Icon>
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </Icon>
              </span>
              <div>
                <h2>Compte</h2>
              </div>
            </header>
            <dl className="ar-pf-facts">
              <div>
                <dt>Adresse e-mail</dt>
                <dd>{email}</dd>
              </div>
              <div>
                <dt>Membre depuis</dt>
                <dd>{formatDate(profile.createdAt, { month: 'long', year: 'numeric' })}</dd>
              </div>
              <div>
                <dt>Dernière connexion</dt>
                <dd>{formatDate(profile.lastLoginAt, { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      {dirty && (
        <div className="ar-pf-savebar" role="region" aria-label="Modifications non enregistrées">
          <span className="ar-pf-savebar__text">
            <i aria-hidden="true" />
            Modifications non enregistrées
          </span>
          <button type="button" className="ar-pf-btn ar-pf-btn--ghost" onClick={handleReset} disabled={saving}>
            Annuler
          </button>
          <button type="submit" form="profile-form" className="ar-pf-btn ar-pf-btn--primary" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { profile, session } = useAuth();
  if (!profile) return null; // ProtectedRoute garantit un profil chargé.

  return (
    <PageShell wide>
      <ProfileView profile={profile} email={profile.email || session?.user?.email || ''} />
    </PageShell>
  );
}
