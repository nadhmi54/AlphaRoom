import { Link } from 'react-router-dom';
import { MODULES } from '../../data/modules.js';
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
  return (
    <section id="features" className="ar-features">
      <div className="ar-features__inner">
        <header className="ar-features__head">
          <span className="ar-features__pill">
            <span className="ar-features__pill-dot" />
            Module fonctionnel · Portefeuille
          </span>
          <h2 className="ar-features__title">
            Une salle de marché,
            <br />
            <span className="ar-features__title--accent">un portefeuille complet.</span>
          </h2>
          <p className="ar-features__lead">
            Carnet d&apos;ordres simulé, exécution au prix du marché et suivi du portefeuille :
            de l&apos;ordre de bourse au P&amp;L, dans des conditions réelles.
          </p>
        </header>

        <div className="ar-features__grid">
          {MODULES.map((module) => (
            <ModuleCard key={module.id} module={module} />
          ))}
        </div>
      </div>
    </section>
  );
}
