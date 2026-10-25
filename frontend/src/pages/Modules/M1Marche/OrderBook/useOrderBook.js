import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../../../services/apiClient.js";
import { getMyOrders, getOrderBook } from "../../../../services/orderBookService.js";

// Le carnet bouge à chaque exécution : il est rafraîchi toutes les 2 s tant que
// l'onglet est visible (le portefeuille de M1 garde son propre rythme de 5 s).
export const BOOK_REFRESH_MS = 2000;

const describeError = (requestError) =>
  requestError instanceof ApiError && requestError.status === 401
    ? "Connectez-vous pour consulter le carnet et passer des ordres."
    : requestError?.message || "Le carnet d’ordres est indisponible.";

/**
 * Photo du carnet + ordres du compte, rafraîchies automatiquement.
 * `refresh()` permet de recharger immédiatement après un ordre ou une
 * annulation.
 */
export function useOrderBook(symbol) {
  const [book, setBook] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);

  const inFlight = useRef(false);
  // Une erreur 401 ne se résoudra pas en réessayant : on arrête le minuteur
  // plutôt que d'interroger l'API toutes les 2 s pour rien.
  const unauthenticated = useRef(false);
  const activeSymbol = useRef(symbol);

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (!quiet) setLoading(true);
      try {
        const [nextBook, nextOrders] = await Promise.all([
          getOrderBook(symbol),
          getMyOrders(),
        ]);
        if (activeSymbol.current !== symbol) return;
        setBook(nextBook);
        setOrders(nextOrders);
        setError("");
        setLastSync(new Date());
        unauthenticated.current = false;
      } catch (requestError) {
        if (activeSymbol.current !== symbol) return;
        unauthenticated.current =
          requestError instanceof ApiError && requestError.status === 401;
        setError(describeError(requestError));
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [symbol],
  );

  useEffect(() => {
    activeSymbol.current = symbol;
    unauthenticated.current = false;
    setBook(null);
    load();
  }, [symbol, load]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible" || unauthenticated.current) return;
      load({ quiet: true });
    };
    const timer = window.setInterval(tick, BOOK_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [load]);

  return { book, orders, error, loading, lastSync, refresh: load };
}
