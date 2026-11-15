import AppBar from '../AppBar/AppBar.jsx';
import './PageShell.css';

// Cadre des pages de compte (profil, administration, IA) : barre
// d'application, titre, puis le contenu. `wide` élargit la zone pour les tableaux.
export default function PageShell({ eyebrow, title, subtitle, wide = false, children }) {
  return (
    <div className="ar-ps">
      <AppBar />
      <main className={`ar-ps__main ${wide ? 'ar-ps__main--wide' : ''}`}>
        {eyebrow && <p className="ui-eyebrow ar-ps__eyebrow">{eyebrow}</p>}
        {title && <h1 className="ar-ps__title">{title}</h1>}
        {subtitle && <p className="ar-ps__subtitle">{subtitle}</p>}
        {children}
      </main>
    </div>
  );
}
