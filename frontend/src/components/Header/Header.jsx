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
            <span className="ar-nav__mark" aria-hidden="true" />
            <span>AlphaRoom</span>
          </a>
          <div className="ar-nav__links">
            <a href="#markets">Marchés</a>
            <a href="#features">Modules</a>
            <a href="#how">Intelligence Artificielle</a>
            <a href="#team">Équipe</a>
          </div>
          <div className="ar-nav__actions">
            <button type="button" className="ar-btn ar-btn--ghost">Se connecter</button>
            <button type="button" className="ar-btn ar-btn--primary">Essai gratuit</button>
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
              <button type="button" className="ar-btn ar-btn--primary">Démarrer la simulation →</button>
              <a href="#features" className="ar-btn ar-btn--ghost">Voir les modules</a>
            </div>

            <div className="ar-hero__stats">
              <div className="ar-hero__stat">
                <span className="ar-num">6</span>
                <span className="ar-hero__stat-label">Modules fonctionnels</span>
              </div>
              <div className="ar-hero__divider" />
              <div className="ar-hero__stat">
                <span className="ar-num">5</span>
                <span className="ar-hero__stat-label">Classes d&apos;actifs</span>
              </div>
              <div className="ar-hero__divider" />
              <div className="ar-hero__stat">
                <span className="ar-num ar-num--green">XAI</span>
                <span className="ar-hero__stat-label">IA 100% explicable</span>
              </div>
            </div>
          </div>

          <div className="ar-hero__visual">
            <div className="ar-chip ar-chip--portfolio">
              <span className="ar-chip__icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 17l6-6 4 4 8-8" />
                  <path d="M15 7h6v6" />
                </svg>
              </span>
              <div className="ar-chip__body">
                <span className="ar-num ar-num--green">+1.86%</span>
                <span className="ar-chip__label">Portefeuille</span>
              </div>
            </div>

            <div className="ar-chip ar-chip--gold">
              <span className="ar-chip__label">Or · XAU/USD</span>
              <span className="ar-num">2,685.40</span>
            </div>

            <div className="ar-chip ar-chip--live">
              <span className="ar-video-live__dot" />
              <span>Session en direct</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
