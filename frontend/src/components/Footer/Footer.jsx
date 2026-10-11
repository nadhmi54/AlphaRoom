import { Link } from 'react-router-dom';
import { SOCIAL_LINKS } from '../../data/socials.js';
import ICON_PATHS from '../../data/socialIcons.js';
import './Footer.css';

const NAV_LINKS = [
  { href: '#markets', label: 'Marchés' },
  { href: '#features', label: 'Modules' },
  { href: '#how', label: 'Intelligence Artificielle' },
  { href: '#team', label: 'Équipe' },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="ar-footer">
      <div className="ar-footer__glow" aria-hidden="true" />
      <div className="ar-footer__inner">
        <div className="ar-footer__top">
          <div className="ar-footer__brand">
            <a href="#top" className="ar-footer__logo-link" aria-label="Retour en haut de la page">
              <img src="/images/alpharoom-logo.png" alt="AlphaRoom" width="52" height="52" />
            </a>
            <p className="ar-footer__tagline">
              Simulateur de salle de marché : trade, risque, IA explicable et stress testing, dans
              un environnement pédagogique complet.
            </p>
          </div>

          <nav className="ar-footer__col" aria-label="Navigation du pied de page">
            <h2 className="ar-footer__heading">Explorer</h2>
            <ul>
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ar-footer__col">
            <h2 className="ar-footer__heading">Compte</h2>
            <ul>
              <li>
                <Link to="/connexion">Se connecter</Link>
              </li>
              <li>
                <Link to="/inscription">Créer un compte</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="ar-footer__bottom">
          <p className="ar-footer__legal">
            © {year} AlphaRoom. Plateforme pédagogique : les données et les opérations sont
            simulées et ne constituent pas un conseil en investissement.
          </p>
          <ul className="ar-footer__socials" aria-label="Réseaux sociaux">
            {SOCIAL_LINKS.map((link) => (
              <li
                key={link.id}
                className="ar-social"
                role="img"
                aria-label={link.label}
                title={link.label}
                style={{ '--social-color': link.color }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                  <path d={ICON_PATHS[link.id]} />
                </svg>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
