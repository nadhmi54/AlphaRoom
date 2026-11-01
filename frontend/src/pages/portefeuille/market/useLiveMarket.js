import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../../services/apiClient.js";
import { getHistory, getQuotes, getSpotPrice } from "../../../services/marketService.js";

// Les 4 actifs natifs gérés par le moteur de prix interne.
const NATIVE_SYMBOLS = new Set(["XAU/USD", "EUR/USD", "BTC/USD", "AAPL"]);

export const QUOTES_REFRESH_MS = 1000;
const CUSTOM_REFRESH_MS = 2000;

export const RANGES = {
  "5m":  { label: "5 min", windowMs: 5 * 60_000,        stepMs: 1_000      },
  "1h":  { label: "1 h",   windowMs: 60 * 60_000,       stepMs: 10_000     },
  "24h": { label: "24 h",  windowMs: 24 * 60 * 60_000,  stepMs: 5 * 60_000 },
};

const describeError = (error) =>
  error instanceof ApiError && error.status === 401
    ? "Connectez-vous pour voir les prix en direct."
    : error?.message || "Les prix en direct sont indisponibles.";

/**
 * Prix en direct + courbe de l'actif choisi.
 *
 * Retourne :
 *   - `quotes`    : [actif courant uniquement] — pour l'en-tête du graphique.
 *   - `allQuotes` : tous les actifs natifs — pour le TickerTape.
 *   - `series`    : points de la courbe.
 *
 * Mode natif  (XAU/USD, BTC/USD, EUR/USD, AAPL) :
 *   - GET /market/quotes toutes les secondes.
 *   - GET /market/history pour la courbe historique.
 *
 * Mode custom (paire Binance ex. BNBUSDT) :
 *   - GET /market/spot toutes les 2 s.
 *   - GET /market/history → klines Binance REST pour la courbe.
 */
export default function useLiveMarket(symbol, range) {
  const [nativeQuotes, setNativeQuotes]     = useState([]);
  const [series, setSeries]                 = useState([]);
  const [error, setError]                   = useState("");
  const [loadingSeries, setLoadingSeries]   = useState(true);
  // `customQuote` utilise le symbole Binance brut (ex. "BNBUSDT") comme clé
  // pour que selected = quotes.find(q => q.symbol === symbol) fonctionne.
  const [customQuote, setCustomQuote]       = useState(null);

  const isCustom = Boolean(symbol) && !NATIVE_SYMBOLS.has(symbol);

  const inFlight = useRef(false);
  const stopped  = useRef(false);
  const current  = useRef({ symbol, range });
  current.current = { symbol, range };

  // ── Historique ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoadingSeries(true);
    setSeries([]);
    getHistory(symbol, range)
      .then((history) => {
        if (cancelled) return;
        const pts = (history.points ?? []).map((p) => ({
          t: typeof p.t === "number" ? p.t : Date.parse(p.t),
          price: p.price,
        }));
        setSeries(pts);
      })
      .catch((err) => {
        if (!cancelled) setError(describeError(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingSeries(false);
      });
    return () => { cancelled = true; };
  }, [symbol, range]);

  // ── Polling NATIF ─────────────────────────────────────────────────────────
  const pollNative = useCallback(async () => {
    if (inFlight.current || stopped.current) return;
    inFlight.current = true;
    try {
      const { quotes: next } = await getQuotes();
      setNativeQuotes(next);
      setError("");

      const { symbol: wanted, range: wantedRange } = current.current;
      if (!NATIVE_SYMBOLS.has(wanted)) return;
      const quote = next.find((q) => q.symbol === wanted);
      if (!quote) return;
      const t = Date.parse(quote.updatedAt);
      const { windowMs, stepMs } = RANGES[wantedRange];
      setSeries((pts) => {
        const last = pts.at(-1);
        if (last && t - last.t < stepMs) return pts;
        const grown = [...pts, { t, price: quote.price }];
        const oldest = t - windowMs;
        let s = 0;
        while (s < grown.length - 2 && grown[s].t < oldest) s++;
        return s ? grown.slice(s) : grown;
      });
    } catch (err) {
      stopped.current = err instanceof ApiError && err.status === 401;
      setError(describeError(err));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    stopped.current = false;
    pollNative();
    const tick = () => { if (document.visibilityState === "visible") pollNative(); };
    const timer = window.setInterval(tick, QUOTES_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stopped.current = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [pollNative]);

  // ── Polling CUSTOM (Binance REST) ─────────────────────────────────────────
  useEffect(() => {
    if (!isCustom) {
      setCustomQuote(null);
      return undefined;
    }
    let cancelled = false;

    const pollCustom = async () => {
      if (cancelled) return;
      try {
        const spot = await getSpotPrice(symbol);
        if (cancelled || !spot.found) return;
        const t = Date.now();
        // On garde symbol (ex. "BNBUSDT") comme clé — pas displaySymbol ("BNB/USDT")
        // pour que selected = quotes.find(q => q.symbol === symbol) fonctionne.
        setCustomQuote({
          symbol:        symbol,
          name:          spot.name ?? symbol,
          displaySymbol: spot.displaySymbol ?? symbol,
          unit:          "unité",
          category:      "crypto",
          price:         spot.price,
          source:        "live",
          updatedAt:     spot.updatedAt,
          changePercent: 0,
          changeSince:   null,
          spark:         [],
        });
        setError("");

        const { range: wantedRange } = current.current;
        const { windowMs, stepMs } = RANGES[wantedRange];
        setSeries((pts) => {
          const last = pts.at(-1);
          if (last && t - last.t < stepMs) return pts;
          const grown = [...pts, { t, price: spot.price }];
          const oldest = t - windowMs;
          let s = 0;
          while (s < grown.length - 2 && grown[s].t < oldest) s++;
          return s ? grown.slice(s) : grown;
        });
      } catch {
        // silencieux
      }
    };

    pollCustom();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") pollCustom();
    }, CUSTOM_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [symbol, isCustom]);

  // ── Quotes exposés ────────────────────────────────────────────────────────
  // `quotes`    = [actif courant] pour l'en-tête du graphique.
  // `allQuotes` = 4 natifs pour le TickerTape (bandeau défilant).
  const selectedNative = nativeQuotes.find((q) => q.symbol === symbol);
  const quotes = isCustom
    ? (customQuote ? [customQuote] : [])
    : (selectedNative ? [selectedNative] : []);

  return { quotes, allQuotes: nativeQuotes, series, error, loadingSeries };
}
