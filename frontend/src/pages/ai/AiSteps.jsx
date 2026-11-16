// Déroulé en étapes numérotées (explication de la démarche, sans logique).
export default function AiSteps({ steps, label }) {
  return (
    <ol className="ai-steps" aria-label={label}>
      {steps.map((step, index) => (
        <li key={step.title} className="ai-steps__item">
          <span className="ai-steps__num ui-num" aria-hidden="true">
            {index + 1}
          </span>
          <div>
            <strong>{step.title}</strong>
            <p>{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// Icône « document » utilisée dans les états vides.
export function DocIcon() {
  return (
    <span className="ai-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6M9 17h4" />
      </svg>
    </span>
  );
}
