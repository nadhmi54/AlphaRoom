import { Link } from 'react-router-dom';
import { MODULES } from '../../data/modules.js';
import './ModuleShell.css';

// Cadre de la page Portefeuille : barre du haut (logo + retour à
// l'accueil), titre du module, puis une zone de travail (`children`).
export default function ModuleShell({ moduleId, children }) {
  const module = MODULES.find((item) => item.id === moduleId);
  if (!module) return null;

  return (
    <div className="ar-mod" style={{ '--mod-accent': module.accent }}>
      <header className="ar-mod__bar">
        <Link to="/" className="ar-mod__brand" aria-label="Retour à l'accueil">
          <img src="/images/alpharoom-logo.png" alt="" width="38" height="38" />
          <span>AlphaRoom</span>
        </Link>
        <Link to="/" className="ar-mod__back">
          ← Accueil
        </Link>
      </header>

      <div className="ar-mod__head">
        <span className="ar-mod__badge">{module.number}</span>
        <div>
          <h1 className="ar-mod__title">{module.title}</h1>
          <p className="ar-mod__question">{module.question}</p>
        </div>
      </div>

      <main className="ar-mod__content">
        {children ?? (
          <div className="ar-mod__empty">Zone de travail du module {module.number}</div>
        )}
      </main>
    </div>
  );
}
