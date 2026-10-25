import { useCallback, useEffect, useRef, useState } from "react";

const LIFETIME_MS = 6000;
const MAX_VISIBLE = 4;

/** Petites notifications qui disparaissent seules (ordre exécuté, reset…). */
export default function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    ({ tone = "info", title, text }) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [...current, { id, tone, title, text }].slice(-MAX_VISIBLE));
      timers.current.set(id, window.setTimeout(() => dismiss(id), LIFETIME_MS));
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  return { toasts, push, dismiss };
}
