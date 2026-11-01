import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/useAuth.js';
import { askCoach } from '../../services/aiService.js';
import EvidenceChips from '../../pages/ai/EvidenceChips.jsx';
import './CoachWidget.css';

const SUGGESTIONS = [
  'Mon risque est-il élevé ?',
  'Pourquoi ai-je perdu ?',
  'Ai-je bien réagi à la news ?',
  'À quoi sert un stop-loss ?',
];
const MAX_HISTORY = 10;

const SOURCE_LABELS = {
  llm: 'Rédigé par l’IA · chiffres vérifiés',
  rules: 'Explication calculée à partir de tes données',
};

/**
 * Trading Coach : un petit chat qui explique la situation de l'étudiant avec ses
 * propres chiffres. Il n'achète rien, ne vend rien et ne prédit pas les prix.
 */
export default function CoachWidget({ sessionId, run }) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, busy]);

  if (!session) return null;

  async function send(text) {
    const question = text.trim();
    if (!question || busy) return;
    const history = messages.slice(-MAX_HISTORY).map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, { role: 'user', content: question }]);
    setInput('');
    setError('');
    setBusy(true);
    try {
      const reply = await askCoach({
        question,
        history,
        ...(sessionId ? { sessionId } : {}),
        ...(run ? { run } : {}),
      });
      setMessages((current) => [...current, { role: 'assistant', content: reply.answer, meta: reply }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    send(input);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') setOpen(false);
  }

  return (
    <div className="coach" onKeyDown={onKeyDown}>
      {open && (
        <section className="coach__panel" role="dialog" aria-label="Coach de trading">
          <header className="coach__head">
            <div>
              <strong>Coach de trading</strong>
              <span>Il explique tes chiffres. Il ne conseille pas d’acheter ou de vendre.</span>
            </div>
            <button type="button" className="coach__close" aria-label="Fermer le coach" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>

          <div className="coach__log" role="log" aria-live="polite">
            {messages.length === 0 && (
              <div className="coach__intro">
                <p>Pose-moi une question sur ta séance. Je réponds avec tes propres données, et je cite mes preuves.</p>
                <div className="coach__suggestions">
                  {SUGGESTIONS.map((suggestion) => (
                    <button key={suggestion} type="button" disabled={busy} onClick={() => send(suggestion)}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={index} className={`coach__msg coach__msg--${message.role}`}>
                <p>{message.content}</p>
                {message.meta && (
                  <div className="coach__meta">
                    <EvidenceChips evidence={message.meta.evidence} />
                    <span>
                      {SOURCE_LABELS[message.meta.source]} · séance {message.meta.sessionId}, passage {message.meta.run}
                    </span>
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="coach__msg coach__msg--assistant coach__typing">Le coach réfléchit…</div>}
            {error && (
              <div className="coach__error" role="alert">
                {error}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form className="coach__form" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              type="text"
              aria-label="Ta question au coach"
              placeholder="Ex. Pourquoi ai-je perdu ?"
              maxLength={1000}
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <button type="submit" disabled={busy || input.trim() === ''}>
              Envoyer
            </button>
          </form>
          <p className="coach__notice">Le coach ne prédit pas les prix et ne donne aucun conseil d’investissement.</p>
        </section>
      )}

      <button
        type="button"
        className="coach__fab"
        aria-expanded={open}
        aria-label={open ? 'Fermer le coach' : 'Ouvrir le coach de trading'}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        </svg>
        Coach
      </button>
    </div>
  );
}
