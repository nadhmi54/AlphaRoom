import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../../../services/apiClient.js";
import { getHistory, getQuotes, getSpotPrice } from "../../../services/marketService.js";

// Repli tant que la liste complète des actifs n'est pas chargée : les quatre
// actifs historiques du moteur.
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

/** Ajoute un point en respectant le pas et la fenêtre de la plage choisie. */
const appendPoint = (points, t, price, windowMs, stepMs) => {
  const last = points.at(-1);
  if (last && t - last.t < stepMs) return points;
  const grown = [...points, { t, price }];
  const oldest = t - windowMs;
  let start = 0;
  while (start < grown.length - 2 && grown[start].t < oldest) start += 1;
  return start ? grown.slice(start) : grown;
};

/**
 * Prix en direct + courbe de l'actif choisi.
 *
 * Retourne :
 *   - `quotes`    : [actif courant uniquement] — pour l'en-tête du graphique.
 *   - `allQuotes` : les quatre actifs natifs — pour le TickerTape.
 *   - `series`    : points de la courbe.
 *
 * Mode moteur (tout actif de `assets` : natifs, actions, matières premières,
 * devises et paires crypto du catalogue) :
 *   - GET /market/quotes toutes les secondes (une seule requête pour tous).
 *   - GET /market/history pour la courbe historique.
 *
 * Mode custom (paire Binance arbitraire absente du catalogue, ex. DOGEUSDT) :
 *   - GET /market/spot toutes les 2 s.
 *   - GET /market/history → klines Binance REST pour la courbe.
 */
export default function useLiveMarket(symbol, range, assets = []) {
  const [nativeQuotes, setNativeQuotes]     = useState([]);
  const [series, setSeries]                 = useState([]);
  const [error, setError]                   = useState("");
  const [loadingSeries, setLoadingSeries]   = useState(true);
  // `customQuote` réutilise le symbole courant comme clé pour que
  // selected = quotes.find(q => q.symbol === symbol) fonctionne.
  const [customQuote, setCustomQuote]       = useState(null);

  // Le backend expose tous les actifs du moteur dans `/market/quotes`. On s'appuie
  // sur ce registre plutôt que sur une liste codée en dur : le catalogue peut
  // grandir sans déclencher un double polling `/quotes` + `/spot`.
  const engineSymbols = useMemo(
    () => new Set(assets.map((asset) => asset.symbol)),
    [assets],
  );
  const isEngine = Boolean(symbol) &&
    (engineSymbols.size > 0 ? engineSymbols.has(symbol) : NATIVE_SYMBOLS.has(symbol));
  const isCustom = Boolean(symbol) && !isEngine;

  const engineSymbolsRef = useRef(engineSymbols);
  engineSymbolsRef.current = engineSymbols;

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
      if (!engineSymbolsRef.current.has(wanted)) return;
      const quote = next.find((q) => q.symbol === wanted);
      if (!quote) return;
      const t = Date.parse(quote.updatedAt);
      const { windowMs, stepMs } = RANGES[wantedRange];
      setSeries((pts) => appendPoint(pts, t, quote.price, windowMs, stepMs));
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
    // Évite d'afficher brièvement la cotation du symbole précédent.
    setCustomQuote(null);

    const pollCustom = async () => {
      if (cancelled) return;
      try {
        const spot = await getSpotPrice(symbol);
        if (cancelled || !spot.found) return;
        const t = Date.now();
        // On garde le symbole courant (ex. « BNB/USDT ») comme clé unique pour
        // que selected = quotes.find(q => q.symbol === symbol) fonctionne.
        setCustomQuote({
          symbol:        symbol,
          name:          spot.name ?? symbol,
          displaySymbol: spot.displaySymbol ?? symbol,
          unit:          spot.unit ?? spot.displaySymbol?.split("/")[0] ?? "unité",
          category:      spot.category ?? "crypto",
          price:         spot.price,
          source:        spot.source ?? "live",
          updatedAt:     spot.updatedAt,
          changePercent: 0,
          changeSince:   null,
          spark:         [],
        });
        setError("");

        const { range: wantedRange } = current.current;
        const { windowMs, stepMs } = RANGES[wantedRange];
        setSeries((pts) => appendPoint(pts, t, spot.price, windowMs, stepMs));
      } catch (err) {
        if (!cancelled) setError(describeError(err));
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
  // `allQuotes` = 4 natifs pour le TickerTape (bandeau défilant). Le moteur
  // marque `native` ; on retombe sur la liste historique pour les anciennes
  // réponses (ou les tests) qui ne portent pas encore ce champ.
  const allQuotes = useMemo(() => {
    const flagged = nativeQuotes.filter((q) => q.native !== undefined);
    return flagged.length > 0
      ? flagged.filter((q) => q.native)
      : nativeQuotes.filter((q) => NATIVE_SYMBOLS.has(q.symbol));
  }, [nativeQuotes]);

  const selectedNative = nativeQuotes.find((q) => q.symbol === symbol);
  const quotes = isCustom
    ? (customQuote ? [customQuote] : [])
    : (selectedNative ? [selectedNative] : []);

  return { quotes, allQuotes, series, error, loadingSeries };
}
