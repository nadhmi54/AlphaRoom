import { Link } from 'react-router-dom';
import { MODULES } from '../../data/modules.js';
import { useAuth } from '../../context/useAuth.js';
import './Features.css';

function ModuleCard({ module }) {
  const { number, title, role, question, description, tags, accent, image, imageAlt, path } = module;

  return (
    <article className="ar-module-card" style={{ '--card-accent': accent }}>
      <div className="ar-module-card__media">
        <img
          src={image}
          alt={imageAlt}
          width="800"
          height="500"
          loading="lazy"
          className="ar-module-card__img"
        />
        <span className="ar-module-card__number">{number}</span>
      </div>

      <div className="ar-module-card__body">
        <h3 className="ar-module-card__title">{title}</h3>
        <p className="ar-module-card__question">{question}</p>
        <p className="ar-module-card__desc">{description}</p>

        <ul className="ar-module-card__tags">
          {tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>

        <div className="ar-module-card__footer">
          <span className="ar-module-card__role">
            <span className="ar-module-card__role-label">Profil</span> {role}
          </span>
          {path && (
            <Link to={path} className="ar-module-card__link">
              Ouvrir le module →
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Features() {
  const { profile } = useAuth();
  // Un module sans `roles` est public ; sinon la carte ne se montre que si le
  // rôle y a droit (et tant qu'aucun profil n'est chargé, tout reste visible).
  const visibleModules = MODULES.filter(
    (module) => !module.roles || !profile || module.roles.includes(profile.role),
  );

  return (
    <section id="features" className="ar-features">
      <div className="ar-features__inner">
        <header className="ar-features__head">
          <span className="ar-features__pill">
            <span className="ar-features__pill-dot" />
            Modules fonctionnels · Finance &amp; assurance
          </span>
          <h2 className="ar-features__title">
            Des outils pour comprendre,
            <br />
            <span className="ar-features__title--accent">simuler et décider.</span>
          </h2>
          <p className="ar-features__lead">
            Du trading aux scénarios pédagogiques et à la tarification d’assurance, explorez des
            simulations pour analyser les marchés et mieux comprendre les risques.
          </p>
        </header>

        <div className="ar-features__grid">
          {visibleModules.map((module) => (
            <ModuleCard key={module.id} module={module} />
          ))}
        </div>
      </div>
    </section>
  );
}
