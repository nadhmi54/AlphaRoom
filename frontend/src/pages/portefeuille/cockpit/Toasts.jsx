const ICONS = { success: "✓", error: "!", info: "i" };

export default function Toasts({ toasts, onDismiss }) {
  return (
    <div className="ck-toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`ck-toast ck-toast--${toast.tone}`} role="status">
          <span className="ck-toast-icon" aria-hidden="true">
            {ICONS[toast.tone] ?? ICONS.info}
          </span>
          <div>
            <strong>{toast.title}</strong>
            {toast.text && <p>{toast.text}</p>}
          </div>
          <button type="button" aria-label="Fermer la notification" onClick={() => onDismiss(toast.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
