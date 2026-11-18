import { Link, useLocation } from 'react-router-dom';
import '../academy.css';

// Onglets internes du module Academy. Le catalogue reste actif sur les pages
// de cours et de quiz (ce sont des sous-pages du catalogue).
const TABS = [
  { to: '/academy', label: 'Catalogue' },
  { to: '/academy/missions', label: 'Missions' },
  { to: '/academy/progression', label: 'Progression' },
  { to: '/academy/badges', label: 'Badges' },
];

function isTabActive(pathname, to) {
  if (to === '/academy') {
    return (
      pathname === '/academy' ||
      pathname.startsWith('/academy/cours') ||
      pathname.startsWith('/academy/quiz')
    );
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * Cadre de l'Academy : barre supérieure, en-tête du module et navigation
 * interne. Autonome (n'utilise pas ModuleShell, dont la liste de modules ne
 * doit pas être modifiée).
 */
export default function AcademyShell({
  title = 'AlphaRoom Academy',
  subtitle = 'Formation, pédagogie et engagement : apprends, passe des quiz, réussis des missions et débloque du contenu.',
  children,
}) {
  const { pathname } = useLocation();

  return (
    <div className="ar-ac">
      <header className="ar-ac__bar">
        <Link to="/" className="ar-ac__brand" aria-label="Retour à l'accueil">
          <img src="/images/alpharoom-logo.png" alt="" width="38" height="38" />
          <span>AlphaRoom</span>
        </Link>
        <Link to="/" className="ar-ac__back">
          ← Accueil
        </Link>
      </header>

      <div className="ar-ac__head">
        <span className="ar-ac__badge">M3</span>
        <div>
          <h1 className="ar-ac__title">{title}</h1>
          <p className="ar-ac__question">{subtitle}</p>
        </div>
      </div>

      <nav className="ar-ac__nav" aria-label="Navigation de l'Academy">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className={`ar-ac__tab${isTabActive(pathname, tab.to) ? ' is-active' : ''}`}
            aria-current={isTabActive(pathname, tab.to) ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <main className="ar-ac__content">{children}</main>
    </div>
  );
}
