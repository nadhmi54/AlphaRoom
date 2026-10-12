import { Link } from 'react-router-dom';
import './PageShell.css';

// Cadre des pages de compte (profil, administration) : logo + retour, titre,
// puis le contenu. `wide` élargit la zone pour les tableaux.
export default function PageShell({ title, subtitle, wide = false, children }) {
  return (
    <div className="ar-ps">
      <header className="ar-ps__bar">
        <Link to="/" className="ar-ps__brand" aria-label="Retour à l'accueil">
          <img src="/images/alpharoom-logo.png" alt="" width="38" height="38" />
          <span>AlphaRoom</span>
        </Link>
        <Link to="/" className="ar-ps__back">
          ← Accueil
        </Link>
      </header>
      <main className={`ar-ps__main ${wide ? 'ar-ps__main--wide' : ''}`}>
        {title && <h1 className="ar-ps__title">{title}</h1>}
        {subtitle && <p className="ar-ps__subtitle">{subtitle}</p>}
        {children}
      </main>
    </div>
  );
}
