import { useState } from 'react';

// Champ mot de passe avec bouton "afficher/masquer" — utilisé sur les pages
// Connexion et Inscription.
export default function PasswordInput({ id, value, onChange, placeholder, autoComplete }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="aa-password">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        className="aa-input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
      />
      <button
        type="button"
        className="aa-password__toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      >
        {visible ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3l18 18" />
            <path d="M10.58 10.58a3 3 0 0 0 4.24 4.24" />
            <path d="M9.36 5.36A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-3.17 4.19M6.6 6.6C4.38 8.1 2 12 2 12s3.5 7 10 7a10.3 10.3 0 0 0 3.4-.6" />
          </svg>
        )}
      </button>
    </div>
  );
}
