import { Link } from 'react-router-dom';
import './AuthLayout.css';

// Mise en page partagée par les pages Connexion / Inscription : vidéo de
// fond en boucle, voile sombre, carte centrale avec le formulaire.
export default function AuthLayout({ eyebrow, title, subtitle, children, footer }) {
  return (
    <div className="aa-auth">
      <video className="aa-auth__bg-video" autoPlay muted loop playsInline aria-hidden="true">
        <source src="/videos/auth-background.mp4" type="video/mp4" />
      </video>
      <div className="aa-auth__scrim" />
      <div className="aa-glow aa-glow--gold" />
      <div className="aa-glow aa-glow--teal" />

      <Link to="/" className="aa-auth__back" aria-label="Retour à l'accueil">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" />
          <path d="M11 18l-6-6 6-6" />
        </svg>
        <span>Accueil</span>
      </Link>

      <div className="aa-auth__inner">
        <Link to="/" className="aa-auth__brand">
          <img
            src="/images/alpharoom-logo.png"
            alt=""
            width="56"
            height="56"
            className="aa-auth__logo"
          />
          <span className="aa-auth__brand-text">AlphaRoom</span>
        </Link>

        <div className="aa-card">
          {eyebrow && <span className="aa-eyebrow">{eyebrow}</span>}
          <h1 className="aa-card__title">{title}</h1>
          {subtitle && <p className="aa-card__subtitle">{subtitle}</p>}

          {children}

          {footer && <div className="aa-card__footer">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
