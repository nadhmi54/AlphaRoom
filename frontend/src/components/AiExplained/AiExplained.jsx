import { AI_EXAMPLE, AI_PRINCIPLES, AI_STEPS } from '../../data/aiExplained.js';
import './AiExplained.css';

const MAX_WEIGHT = Math.max(...AI_EXAMPLE.factors.map((f) => Math.abs(f.weight)));

function formatWeight(weight) {
  const sign = weight > 0 ? '+' : '−';
  return `${sign}${Math.abs(weight).toFixed(2)}`;
}

function ExampleCard() {
  return (
    <aside className="ar-ai-card" aria-label="Exemple de recommandation expliquée">
      <div className="ar-ai-card__top">
        <span className="ar-ai-card__label">Recommandation IA</span>
        <span className="ar-ai-card__tag">Exemple illustratif</span>
      </div>

      <div className="ar-ai-card__head">
        <div>
          <span className="ar-ai-card__symbol">{AI_EXAMPLE.symbol}</span>
          <span className="ar-ai-card__asset">{AI_EXAMPLE.name}</span>
        </div>
        <span className="ar-ai-card__signal">{AI_EXAMPLE.signal}</span>
      </div>

      <div className="ar-ai-card__confidence">
        <div className="ar-ai-card__confidence-row">
          <span>Niveau de confiance</span>
          <strong>{AI_EXAMPLE.confidence} %</strong>
        </div>
        <div className="ar-ai-card__meter" aria-hidden="true">
          <span style={{ width: `${AI_EXAMPLE.confidence}%` }} />
        </div>
      </div>

      <h3 className="ar-ai-card__why">Pourquoi cette recommandation ?</h3>
      <ul className="ar-ai-card__factors">
        {AI_EXAMPLE.factors.map((factor) => {
          const positive = factor.weight > 0;
          const width = (Math.abs(factor.weight) / MAX_WEIGHT) * 50;
          return (
            <li key={factor.label} className="ar-ai-factor">
              <div className="ar-ai-factor__row">
                <span>{factor.label}</span>
                <span className={`ar-ai-factor__value ${positive ? 'is-pos' : 'is-neg'}`}>
                  {formatWeight(factor.weight)}
                </span>
              </div>
              <div className="ar-ai-factor__track" aria-hidden="true">
                <span
                  className={`ar-ai-factor__bar ${positive ? 'is-pos' : 'is-neg'}`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="ar-ai-card__foot">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        Vérifiée par backtesting sur l&apos;historique
      </p>
    </aside>
  );
}

export default function AiExplained() {
  return (
    <section id="how" className="ar-ai">
      <div className="ar-ai__orb ar-ai__orb--a" aria-hidden="true" />
      <div className="ar-ai__orb ar-ai__orb--b" aria-hidden="true" />
      <div className="ar-ai__inner">
        <header className="ar-ai__head">
          <span className="ar-ai__pill">
            <span className="ar-ai__pill-dot" />
            IA explicable · XAI
          </span>
          <h2 className="ar-ai__title">
            Une IA qui montre son raisonnement.
            <br />
            <span className="ar-ai__title--accent">Jamais une boîte noire.</span>
          </h2>
          <p className="ar-ai__lead">
            L&apos;intelligence artificielle explicable (XAI) ne se contente pas de donner une
            réponse : elle te dit pourquoi. Tu comprends chaque décision, tu peux la vérifier, et tu
            apprends en la suivant.
          </p>
        </header>

        <div className="ar-ai__layout">
          <ol className="ar-ai__steps">
            {AI_STEPS.map((step, index) => (
              <li key={step.id} className="ar-ai-step">
                <span className="ar-ai-step__num" aria-hidden="true">
                  {index + 1}
                </span>
                <div className="ar-ai-step__body">
                  <h3 className="ar-ai-step__title">{step.title}</h3>
                  <p className="ar-ai-step__desc">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>

          <ExampleCard />
        </div>

        <div className="ar-ai__principles-head">
          <span className="ar-ai__principles-kicker">Nos engagements</span>
          <h3 className="ar-ai__principles-title">Trois promesses pour une IA de confiance</h3>
        </div>

        <ul className="ar-ai__principles">
          {AI_PRINCIPLES.map((item, index) => (
            <li
              key={item.id}
              className="ar-ai-principle"
              style={{ '--principle-accent': item.accent }}
            >
              <img
                className="ar-ai-principle__img"
                src={item.image}
                alt={item.imageAlt}
                loading="lazy"
                style={{ objectPosition: item.position }}
              />
              <div className="ar-ai-principle__content">
                <span className="ar-ai-principle__num" aria-hidden="true">
                  0{index + 1}
                </span>
                <h3 className="ar-ai-principle__title">{item.title}</h3>
                <p className="ar-ai-principle__desc">{item.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
