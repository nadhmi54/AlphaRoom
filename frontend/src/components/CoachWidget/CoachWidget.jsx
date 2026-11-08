import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/useAuth.js';
import {
  deleteConversation,
  getConversation,
  getGuideAlerts,
  getGuideBriefing,
  getGuideDebrief,
  listConversations,
  renameConversation,
  streamCoach,
} from '../../services/aiService.js';
import EvidenceChips from '../../pages/ai/EvidenceChips.jsx';
import Markdown from './Markdown.jsx';
import './CoachWidget.css';

const SUGGESTIONS = [
  'Où j’en suis en ce moment ?',
  'Quel marché a le mieux performé ce mois-ci ?',
  'Et si le prix baisse de 3 % ?',
  'Quand acheter ou vendre l’or ?',
  'Quelle chance que mon stop saute cette semaine ?',
];
const POLL_MS = 8000;
const MAX_POLL_ERRORS = 5;

const SOURCE_LABELS = {
  llm: 'Rédigé par l’IA',
  rules: 'Explication calculée à partir de tes données',
};

const TOOL_LABELS = {
  get_session_info: 'la séance',
  get_portfolio: 'ton portefeuille',
  get_trades: 'tes ordres',
  get_market: 'le marché',
  get_events: 'les news',
  get_risk_review: 'tes risques',
  get_memory: 'vos échanges précédents',
  simulate_price_move: 'une simulation de prix',
  simulate_stop_loss: 'une simulation de stop-loss',
  position_size: 'un calcul de taille de position',
  scan_markets: 'le classement des marchés',
  analyze_asset: 'l’analyse de l’actif',
  simulate_outcomes: 'une simulation Monte Carlo',
  backtest_signal: 'le test du signal sur l’historique',
};

const SEVERITY_LABELS = { info: 'Info', warn: 'Attention', alert: 'Important' };

// On retient seulement QUELLE discussion était ouverte (par personne et par séance) ; le contenu vit sur le serveur.
function lastKey(userId, sessionId) {
  return `alpharoom:coach:last:${userId ?? 'anon'}:${sessionId ?? 'none'}`;
}

function readLast(key) {
  try {
    return window.localStorage.getItem(key) || null;
  } catch {
    return null;
  }
}

function writeLast(key, id) {
  try {
    if (id) window.localStorage.setItem(key, id);
    else window.localStorage.removeItem(key);
  } catch {
    // Stockage indisponible (navigation privée…) : on rouvrira simplement une discussion vierge.
  }
}

const isChat = (m) => m.role === 'user' || m.role === 'assistant';

// Messages du serveur → messages affichés.
function fromServer(messages) {
  return messages.map((m) => {
    if (m.role === 'user') return { role: 'user', content: m.content };
    const meta = m.meta && Object.keys(m.meta).length > 0 ? m.meta : undefined;
    return { role: 'assistant', content: m.content, ...(meta ? { meta, tools: meta.toolsUsed ?? [] } : {}) };
  });
}

// Les salles ont un identifiant long (UUID) : on n'en montre que le début.
const shortId = (id) => (id.length > 14 ? `${id.slice(0, 8)}…` : id);

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Coach de trading : un agent avec qui on discute librement pendant la séance.
 *   - la réponse s'écrit EN DIRECT, avec listes et tableaux quand c'est utile ;
 *   - il consulte les vraies données (et fait des simulations « et si ? ») avant de répondre ;
 *   - il PRÉVIENT de lui-même aux bons moments (position sans stop-loss, news sans réaction…) ;
 *   - briefing au début, bilan à la demande ;
 *   - plusieurs discussions, gardées sur le serveur : on les retrouve, on les renomme, on les supprime,
 *   et le coach se souvient de ce qui s'est dit dans chacune.
 */
export default function CoachWidget({ sessionId, run }) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const key = lastKey(userId, sessionId);
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [view, setView] = useState('chat');
  const [conversations, setConversations] = useState(null);
  const [loading, setLoading] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [unread, setUnread] = useState(0);
  const [teaser, setTeaser] = useState(null);
  const inputRef = useRef(null);
  const endRef = useRef(null);
  const abortRef = useRef(null);
  const seenAlerts = useRef(new Set());
  const briefed = useRef(false);
  const openRef = useRef(false);
  const loadedKey = useRef(null);
  const listStale = useRef(true);
  const target = { ...(sessionId ? { sessionId } : {}), ...(run ? { run } : {}) };
  const targetKey = `${sessionId ?? ''}:${run ?? ''}`;
  const signedIn = Boolean(session);

  // Ouverture de la page, changement de séance ou d'utilisateur : on rouvre la dernière discussion de cette séance.
  useEffect(() => {
    if (!signedIn || loadedKey.current === key) return undefined;
    loadedKey.current = key;
    briefed.current = false;
    seenAlerts.current = new Set();
    listStale.current = true;
    setMessages([]);
    setConversationId(null);
    setConversations(null);
    setView('chat');
    const last = readLast(key);
    if (!last) return undefined;
    let cancelled = false;
    setLoading(true);
    getConversation(last)
      .then((data) => {
        if (cancelled) return;
        // Les cartes du guide arrivées entre-temps (briefing, alertes) restent autour de la discussion.
        setMessages((current) => [
          ...current.filter((m) => m.role === 'briefing'),
          ...fromServer(data.messages),
          ...current.filter((m) => !isChat(m) && m.role !== 'briefing'),
        ]);
        setConversationId(last);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e?.status === 404) writeLast(key, null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      loadedKey.current = null;
    };
  }, [key, signedIn]);

  useEffect(() => {
    openRef.current = open;
    if (open) {
      inputRef.current?.focus();
      setUnread(0);
      setTeaser(null);
    }
  }, [open]);

  useEffect(() => {
    // Le briefing se lit depuis son début : on ne fait défiler vers le bas que pour un nouveau message.
    if (messages.at(-1)?.role === 'briefing') return;
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, busy, status, open]);

  // Le champ de saisie grandit avec le texte (jusqu'à 6 lignes).
  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 140)}px`;
  }, [input, open]);

  // Guide proactif : on demande régulièrement au serveur s'il y a une nouvelle alerte.
  // Pas d'appel au modèle ici : ce sont des règles, rapides et gratuites.
  const poll = useCallback(async () => {
    const data = await getGuideAlerts(target);
    const fresh = (data?.alerts ?? []).filter((alert) => !seenAlerts.current.has(alert.id));
    if (fresh.length === 0) return;
    fresh.forEach((alert) => seenAlerts.current.add(alert.id));
    setMessages((current) => [...current, ...fresh.map((alert) => ({ role: 'alert', alert }))]);
    if (!openRef.current) {
      setUnread((count) => count + fresh.length);
      setTeaser(fresh.find((a) => a.severity !== 'info') ?? fresh[0]);
    }
  }, [targetKey]);

  useEffect(() => {
    if (!signedIn || !sessionId) return undefined;
    let errors = 0;
    let stopped = false;
    const tick = async () => {
      if (stopped || errors >= MAX_POLL_ERRORS || document.visibilityState === 'hidden') return;
      try {
        await poll();
        errors = 0;
      } catch {
        errors += 1;
      }
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [signedIn, sessionId, poll]);

  // Briefing de début : une seule fois (le serveur dit si c'est la première).
  useEffect(() => {
    if (!open || !signedIn || !sessionId || briefed.current) return;
    briefed.current = true;
    getGuideBriefing(target)
      .then((briefing) => {
        if (briefing?.first) setMessages((current) => [{ role: 'briefing', briefing }, ...current]);
      })
      .catch(() => {});
  }, [open, signedIn, sessionId]);

  // Quitter la page pendant qu'une réponse s'écrit : on coupe proprement la connexion.
  useEffect(() => () => abortRef.current?.abort(), []);

  if (!session) return null;

  const patchLast = (changes) =>
    setMessages((current) => {
      if (current.length === 0) return current;
      const next = [...current];
      next[next.length - 1] = { ...next[next.length - 1], ...changes };
      return next;
    });

  async function send(text) {
    const question = text.trim();
    if (!question || busy || loading) return;
    setView('chat');
    setMessages((current) => [...current, { role: 'user', content: question }, { role: 'assistant', content: '', streaming: true, tools: [] }]);
    setInput('');
    setError('');
    setStatus('');
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let text_ = '';
    let tools = [];
    let finished = false;
    try {
      await streamCoach(
        { question, ...(conversationId ? { conversationId } : {}), ...target },
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === 'tool') {
              // Ce qui précédait l'appel d'outil n'était qu'une phrase d'attente : on repart d'une page blanche.
              text_ = '';
              tools = [...new Set([...tools, event.name])];
              setStatus(`Consulte ${TOOL_LABELS[event.name] ?? event.name}…`);
              patchLast({ content: '', tools });
            } else if (event.type === 'delta') {
              text_ += event.text;
              setStatus('');
              patchLast({ content: text_ });
            } else if (event.type === 'reset') {
              text_ = '';
              setStatus('Vérifie ses chiffres…');
              patchLast({ content: '' });
            } else if (event.type === 'conversation') {
              // Nouvelle discussion : le serveur vient de la créer, on retient son identifiant.
              setConversationId(event.id);
              writeLast(key, event.id);
              listStale.current = true;
            } else if (event.type === 'done') {
              finished = true;
              const reply = event.reply;
              if (reply.conversationId) {
                setConversationId(reply.conversationId);
                writeLast(key, reply.conversationId);
              }
              listStale.current = true;
              patchLast({ content: reply.answer, streaming: false, meta: reply, tools: reply.toolsUsed ?? tools });
            } else if (event.type === 'error') {
              finished = true;
              setError(event.message || 'Le coach est indisponible.');
              setMessages((current) => current.filter((m, i) => !(i === current.length - 1 && m.streaming && !m.content)));
            }
          },
        },
      );
      if (!finished) patchLast({ streaming: false });
    } catch (e) {
      if (e?.name === 'AbortError') {
        patchLast({ streaming: false, interrupted: true });
      } else {
        setError(e.message || 'Le coach est indisponible.');
        setMessages((current) => current.filter((m, i) => !(i === current.length - 1 && m.streaming && !m.content)));
      }
    } finally {
      setMessages((current) => current.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
      abortRef.current = null;
      setStatus('');
      setBusy(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function requestDebrief() {
    if (busy) return;
    setMessages((current) => [...current, { role: 'user', content: 'Fais le bilan de ma séance.' }]);
    setError('');
    setBusy(true);
    setStatus('Prépare ton bilan…');
    try {
      const debrief = await getGuideDebrief(target);
      setMessages((current) => [...current, { role: 'debrief', debrief }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setStatus('');
      setBusy(false);
    }
  }

  function newConversation() {
    if (busy) return;
    // La nouvelle discussion n'est créée côté serveur qu'à la première question.
    setConversationId(null);
    writeLast(key, null);
    setMessages([]);
    setError('');
    setView('chat');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function refreshList() {
    try {
      const data = await listConversations();
      setConversations(data?.conversations ?? []);
      listStale.current = false;
    } catch (e) {
      setError(e.message || 'Impossible de charger tes discussions.');
    }
  }

  function toggleList() {
    if (view === 'list') {
      setView('chat');
      return;
    }
    setView('list');
    setRenaming(null);
    setConfirming(null);
    if (listStale.current || conversations === null) refreshList();
  }

  async function openConversation(id) {
    if (busy || id === conversationId) {
      setView('chat');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await getConversation(id);
      setMessages(fromServer(data.messages));
      setConversationId(id);
      writeLast(key, id);
      setView('chat');
    } catch (e) {
      setError(e.message || 'Impossible d’ouvrir cette discussion.');
      if (e?.status === 404) refreshList();
    } finally {
      setLoading(false);
    }
  }

  async function saveRename() {
    if (!renaming) return;
    const title = renaming.value.trim();
    const { id } = renaming;
    setRenaming(null);
    if (!title) return;
    try {
      const data = await renameConversation(id, title);
      setConversations((current) => (current ?? []).map((c) => (c.id === id ? { ...c, title: data?.conversation?.title ?? title } : c)));
    } catch (e) {
      setError(e.message || 'Impossible de renommer cette discussion.');
    }
  }

  async function confirmDelete(id) {
    setConfirming(null);
    try {
      await deleteConversation(id);
      setConversations((current) => (current ?? []).filter((c) => c.id !== id));
      if (id === conversationId) {
        setConversationId(null);
        writeLast(key, null);
        setMessages([]);
      }
    } catch (e) {
      setError(e.message || 'Impossible de supprimer cette discussion.');
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    send(input);
  }

  function onInputKeyDown(event) {
    // Entrée envoie, Maj+Entrée va à la ligne (comme dans une vraie discussion).
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) {
      event.preventDefault();
      send(input);
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') setOpen(false);
  }

  const hasConversation = messages.some(isChat);

  return (
    <div className="coach" onKeyDown={onKeyDown}>
      {!open && teaser && (
        <button type="button" className={`coach__teaser coach__teaser--${teaser.severity}`} onClick={() => setOpen(true)}>
          <strong>{teaser.title}</strong>
          <span>Clique pour en savoir plus</span>
        </button>
      )}

      {open && (
        <section className={`coach__panel${wide ? ' coach__panel--wide' : ''}`} role="dialog" aria-label="Coach de trading">
          <header className="coach__head">
            <div>
              <strong>Coach de trading</strong>
              <span>Parle-lui comme à un mentor : il consulte tes données et te répond.</span>
            </div>
            <div className="coach__tools-bar">
              <button
                type="button"
                className={`coach__iconbtn${view === 'list' ? ' coach__iconbtn--on' : ''}`}
                title="Mes discussions"
                aria-label="Mes discussions"
                aria-pressed={view === 'list'}
                onClick={toggleList}
              >
                ☰
              </button>
              {(hasConversation || conversationId) && (
                <button type="button" className="coach__iconbtn" title="Nouvelle discussion" aria-label="Nouvelle discussion" disabled={busy} onClick={newConversation}>
                  ＋
                </button>
              )}
              <button type="button" className="coach__iconbtn" title={wide ? 'Réduire' : 'Agrandir'} aria-label={wide ? 'Réduire la fenêtre' : 'Agrandir la fenêtre'} onClick={() => setWide((v) => !v)}>
                {wide ? '⤡' : '⤢'}
              </button>
              <button type="button" className="coach__close" aria-label="Fermer le coach" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
          </header>

          {view === 'list' && (
            <div className="coach__list" aria-label="Mes discussions">
              <button type="button" className="coach__new" disabled={busy} onClick={newConversation}>
                ＋ Nouvelle discussion
              </button>
              {conversations === null && <p className="coach__empty">Chargement…</p>}
              {conversations?.length === 0 && <p className="coach__empty">Aucune discussion pour l’instant. Pose ta première question !</p>}
              <ul>
                {(conversations ?? []).map((c) => (
                  <li key={c.id} className={c.id === conversationId ? 'coach__conv coach__conv--active' : 'coach__conv'}>
                    {renaming?.id === c.id ? (
                      <input
                        className="coach__rename"
                        aria-label="Nouveau titre"
                        autoFocus
                        maxLength={120}
                        value={renaming.value}
                        onChange={(event) => setRenaming({ id: c.id, value: event.target.value })}
                        onBlur={saveRename}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            saveRename();
                          } else if (event.key === 'Escape') {
                            event.stopPropagation();
                            setRenaming(null);
                          }
                        }}
                      />
                    ) : (
                      <button type="button" className="coach__convmain" onClick={() => openConversation(c.id)}>
                        <strong>{c.title}</strong>
                        <small>
                          {formatDate(c.updatedAt)} · {c.messageCount} message{c.messageCount > 1 ? 's' : ''}
                          {c.sessionId ? ` · séance ${shortId(c.sessionId)}` : ''}
                        </small>
                      </button>
                    )}
                    {confirming === c.id ? (
                      <span className="coach__confirm" role="group" aria-label="Confirmer la suppression">
                        <span>Supprimer ?</span>
                        <button type="button" onClick={() => confirmDelete(c.id)}>
                          Oui
                        </button>
                        <button type="button" onClick={() => setConfirming(null)}>
                          Non
                        </button>
                      </span>
                    ) : (
                      renaming?.id !== c.id && (
                        <span className="coach__convactions">
                          <button type="button" className="coach__iconbtn" aria-label={`Renommer ${c.title}`} title="Renommer" onMouseDown={(event) => event.preventDefault()} onClick={() => setRenaming({ id: c.id, value: c.title })}>
                            ✎
                          </button>
                          <button type="button" className="coach__iconbtn" aria-label={`Supprimer ${c.title}`} title="Supprimer" onClick={() => setConfirming(c.id)}>
                            🗑
                          </button>
                        </span>
                      )
                    )}
                  </li>
                ))}
              </ul>
              {error && (
                <div className="coach__error" role="alert">
                  {error}
                </div>
              )}
            </div>
          )}

          <div className="coach__log" role="log" aria-live="polite" hidden={view === 'list'}>
            {loading && <p className="coach__empty">Ouverture de la discussion…</p>}
            {!hasConversation && !loading && (
              <div className="coach__intro">
                <p>Écris-moi ce que tu veux : une question sur ta position, une idée de trade, un doute, une notion à comprendre. Je regarde tes données avant de répondre, et je te préviens quand quelque chose mérite ton attention.</p>
                <div className="coach__suggestions">
                  {SUGGESTIONS.map((suggestion) => (
                    <button key={suggestion} type="button" disabled={busy} onClick={() => send(suggestion)}>
                      {suggestion}
                    </button>
                  ))}
                  {sessionId && (
                    <button type="button" className="coach__debrief" disabled={busy} onClick={requestDebrief}>
                      Mon bilan
                    </button>
                  )}
                </div>
              </div>
            )}
            {messages.map((message, index) => {
              if (message.role === 'briefing') return <BriefingCard key={index} briefing={message.briefing} />;
              if (message.role === 'alert') return <AlertCard key={index} alert={message.alert} busy={busy} onAsk={send} />;
              if (message.role === 'debrief') return <DebriefCard key={index} debrief={message.debrief} />;
              if (message.role === 'user') {
                return (
                  <div key={index} className="coach__msg coach__msg--user">
                    <p>{message.content}</p>
                  </div>
                );
              }
              return (
                <div key={index} className="coach__msg coach__msg--assistant">
                  {message.content ? (
                    <Markdown text={message.content} />
                  ) : (
                    <p className="coach__typing">{status || 'Le coach réfléchit…'}</p>
                  )}
                  {message.streaming && message.content && <span className="coach__cursor" aria-hidden="true" />}
                  {message.interrupted && <small className="coach__note">Réponse interrompue.</small>}
                  {message.meta?.unverified?.length > 0 && (
                    <small className="coach__warn">
                      Chiffres estimés ou proposés par le coach (ils ne viennent pas de tes données) : {message.meta.unverified.join(', ')}.
                    </small>
                  )}
                  {message.meta && !message.streaming && (
                    <div className="coach__meta">
                      {message.tools?.length > 0 && (
                        <span className="coach__tools">A consulté : {message.tools.map((tool) => TOOL_LABELS[tool] ?? tool).join(', ')}</span>
                      )}
                      <EvidenceChips evidence={message.meta.evidence} />
                      <span>
                        {SOURCE_LABELS[message.meta.source]} · séance {message.meta.sessionId}, passage {message.meta.run}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
            {busy && status && messages.at(-1)?.content && <div className="coach__status">{status}</div>}
            {error && (
              <div className="coach__error" role="alert">
                {error}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {view === 'chat' && hasConversation && sessionId && (
            <div className="coach__quick">
              <button type="button" disabled={busy} onClick={requestDebrief}>
                Mon bilan
              </button>
            </div>
          )}

          <form className="coach__form" onSubmit={onSubmit} hidden={view === 'list'}>
            <textarea
              ref={inputRef}
              rows={1}
              aria-label="Ton message au coach"
              placeholder="Écris ce que tu veux… (Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne)"
              maxLength={2000}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onInputKeyDown}
            />
            {busy ? (
              <button type="button" className="coach__stop" onClick={stop}>
                Stop
              </button>
            ) : (
              <button type="submit" disabled={input.trim() === ''}>
                Envoyer
              </button>
            )}
          </form>
          <p className="coach__notice">Simulation à but pédagogique : ses avis ne sont pas des conseils financiers et rien n’est garanti.</p>
        </section>
      )}

      <button
        type="button"
        className={`coach__fab${unread > 0 ? ' coach__fab--alert' : ''}`}
        aria-expanded={open}
        aria-label={open ? 'Fermer le coach' : 'Ouvrir le coach de trading'}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        </svg>
        Coach
        {unread > 0 && (
          <span className="coach__badge" aria-label={`${unread} nouveau${unread > 1 ? 'x' : ''} conseil${unread > 1 ? 's' : ''}`}>
            {unread}
          </span>
        )}
      </button>
    </div>
  );
}

function AlertCard({ alert, busy, onAsk }) {
  return (
    <div className={`coach__card coach__card--${alert.severity}`} role="group" aria-label={alert.title}>
      <div className="coach__cardhead">
        <span className="coach__tag">{SEVERITY_LABELS[alert.severity] ?? 'Info'}</span>
        <span className="coach__minute">minute {alert.minute}</span>
      </div>
      <strong>{alert.title}</strong>
      <p>{alert.message}</p>
      <button type="button" disabled={busy} onClick={() => onAsk(alert.question)}>
        En parler au coach
      </button>
    </div>
  );
}

function BriefingCard({ briefing }) {
  return (
    <div className="coach__card coach__card--briefing" role="group" aria-label="Briefing de séance">
      <div className="coach__cardhead">
        <span className="coach__tag">Briefing</span>
      </div>
      <p>{briefing.text}</p>
      <ul>
        {briefing.objectives.map((objective) => (
          <li key={objective}>{objective}</li>
        ))}
      </ul>
    </div>
  );
}

function DebriefCard({ debrief }) {
  return (
    <div className="coach__card coach__card--debrief" role="group" aria-label="Bilan de séance">
      <div className="coach__cardhead">
        <span className="coach__tag">Bilan</span>
        <span className="coach__minute">minute {debrief.minute}</span>
      </div>
      <p>{debrief.text}</p>
      {debrief.strengths?.length > 0 && (
        <>
          <h4>Ce qui a bien fonctionné</h4>
          <ul>
            {debrief.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}
      {debrief.toImprove?.length > 0 && (
        <>
          <h4>À retravailler</h4>
          <ul>
            {debrief.toImprove.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}
      <small>{SOURCE_LABELS[debrief.source]}</small>
    </div>
  );
}
