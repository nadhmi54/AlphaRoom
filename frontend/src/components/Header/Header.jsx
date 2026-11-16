import { Link } from 'react-router-dom';
import UserMenu from './UserMenu.jsx';
import HeroTerminal from '../HeroTerminal/HeroTerminal.jsx';
import './Header.css';
import { TICKER_ITEMS } from '../../data/marketTicker.js';

export default function Header() {
  return (
    <header className="ar-header">
      <video className="ar-header__bg-video" autoPlay muted loop playsInline aria-hidden="true">
        <source src="/videos/trading-hero.mp4" type="video/mp4" />
      </video>
      <div className="ar-header__scrim" />
      <div className="ar-header__grid" aria-hidden="true" />

      <svg className="ar-grain" aria-hidden="true">
        <filter id="ar-grain-filter">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#ar-grain-filter)" />
      </svg>

      <div className="ar-glow ar-glow--gold" />
      <div className="ar-glow ar-glow--teal" />
      <div className="ar-glow ar-glow--indigo" />

      <div className="ar-header__inner">
        <nav className="ar-nav">
          <a href="#top" className="ar-nav__brand">
            <img
              src="/images/alpharoom-logo.png"
              alt=""
              width="46"
              height="46"
              className="ar-nav__logo"
            />
            <span className="ar-nav__brand-text">AlphaRoom</span>
          </a>
          <div className="ar-nav__links">
            <a href="#markets">Marchés</a>
            <a href="#features">Modules</a>
            <a href="#how">Intelligence Artificielle</a>
            <a href="#team">Équipe</a>
          </div>
          <div className="ar-nav__actions">
            <UserMenu />
          </div>
        </nav>

        <div className="ar-ticker" aria-hidden="true">
          <div className="ar-ticker__track">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <span className="ar-ticker__item" key={i}>
                <span className="ar-ticker__symbol">{item.symbol}</span>
                <span className={`ar-ticker__value ${item.up ? 'is-up' : 'is-down'}`}>
                  {item.up ? '▲' : '▼'} {item.value}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="ar-hero">
          <div className="ar-hero__copy">
            <span className="ar-eyebrow-pill">
              <span className="ar-eyebrow-pill__dot" />
              <span className="ar-eyebrow">Simulateur de salle de marché</span>
            </span>

            <h1 className="ar-hero__title">
              La rigueur d&apos;une
              <br />
              vraie salle de marché.
              <br />
              <span className="ar-hero__title--accent">Zéro risque financier.</span>
            </h1>

            <p className="ar-hero__lead">
              AlphaRoom reproduit les conditions réelles d&apos;une salle de marché : trading
              multi-actifs, gestion du risque et intelligence artificielle explicable — pour se
              former sans jamais risquer un centime.
            </p>

            <div className="ar-hero__cta">
              <Link to="/inscription" className="ar-btn ar-btn--primary">Démarrer la simulation →</Link>
              <a href="#features" className="ar-btn ar-btn--ghost">Voir les modules</a>
            </div>

            <div className="ar-hero__stats">
              <div className="ar-hero__stat">
                <span className="ar-num">4</span>
                <span className="ar-hero__stat-label">Grands marchés</span>
              </div>
              <div className="ar-hero__divider" />
              <div className="ar-hero__stat">
                <span className="ar-num">2</span>
                <span className="ar-hero__stat-label">Modules de simulation</span>
              </div>
              <div className="ar-hero__divider" />
              <div className="ar-hero__stat">
                <span className="ar-num ar-num--green">XAI</span>
                <span className="ar-hero__stat-label">IA 100% explicable</span>
              </div>
            </div>
          </div>

          <div className="ar-hero__visual">
            <HeroTerminal />
          </div>
        </div>
      </div>
    </header>
  );
}
