import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../../services/apiClient.js";
import { getHistory, getQuotes } from "../../../services/marketService.js";

// Les prix changent chaque seconde côté serveur : on les relit à la même cadence.
export const QUOTES_REFRESH_MS = 1000;

// Durée affichée et finesse des points de chaque période (voir le backend).
export const RANGES = {
  "5m": { label: "5 min", windowMs: 5 * 60_000, stepMs: 1000 },
  "1h": { label: "1 h", windowMs: 60 * 60_000, stepMs: 10_000 },
  "24h": { label: "24 h", windowMs: 24 * 60 * 60_000, stepMs: 5 * 60_000 },
};

const describeError = (error) =>
  error instanceof ApiError && error.status === 401
    ? "Connectez-vous pour voir les prix en direct."
    : error?.message || "Les prix en direct sont indisponibles.";

/**
 * Prix en direct + courbe de l'actif choisi.
 * - `quotes` est relu chaque seconde ;
 * - `series` part de l'historique du serveur, puis chaque nouveau prix est
 *   ajouté à la fin : la courbe avance toute seule, sans recharger.
 */
export default function useLiveMarket(symbol, range) {
  const [quotes, setQuotes] = useState([]);
  const [series, setSeries] = useState([]);
  const [error, setError] = useState("");
  const [loadingSeries, setLoadingSeries] = useState(true);

  const inFlight = useRef(false);
  const stopped = useRef(false);
  const current = useRef({ symbol, range });
  current.current = { symbol, range };

  // Historique de la période : au changement d'actif ou de période.
  useEffect(() => {
    let cancelled = false;
    setLoadingSeries(true);
    setSeries([]);
    getHistory(symbol, range)
      .then((history) => {
        if (cancelled) return;
        setSeries(history.points.map((p) => ({ t: Date.parse(p.t), price: p.price })));
      })
      .catch((requestError) => {
        if (!cancelled) setError(describeError(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoadingSeries(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, range]);

  const poll = useCallback(async () => {
    if (inFlight.current || stopped.current) return;
    inFlight.current = true;
    try {
      const { quotes: next } = await getQuotes();
      setQuotes(next);
      setError("");
      const { symbol: wanted, range: wantedRange } = current.current;
      const quote = next.find((item) => item.symbol === wanted);
      if (quote) {
        const t = Date.parse(quote.updatedAt);
        const { windowMs, stepMs } = RANGES[wantedRange];
        setSeries((points) => {
          const last = points.at(-1);
          if (last && t - last.t < stepMs) return points;
          const grown = [...points, { t, price: quote.price }];
          const oldest = t - windowMs;
          let start = 0;
          while (start < grown.length - 2 && grown[start].t < oldest) start += 1;
          return start ? grown.slice(start) : grown;
        });
      }
    } catch (requestError) {
      // Une 401 ne se réglera pas en réessayant : on arrête d'interroger l'API.
      stopped.current = requestError instanceof ApiError && requestError.status === 401;
      setError(describeError(requestError));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    stopped.current = false;
    poll();
    const tick = () => {
      if (document.visibilityState === "visible") poll();
    };
    const timer = window.setInterval(tick, QUOTES_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stopped.current = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [poll]);

  return { quotes, series, error, loadingSeries };
}
