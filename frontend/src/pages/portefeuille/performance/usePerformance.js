import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../../services/apiClient.js";
import { getPerformance, getPerformanceHistory } from "../../../services/performanceService.js";

const describeError = (error) =>
  error instanceof ApiError && error.status === 401
    ? "Connectez-vous pour consulter les indicateurs de performance."
    : error.message || "Impossible de charger les indicateurs de performance.";

/**
 * Charge les indicateurs courants et l'historique quotidien d'un portefeuille.
 *
 * Les deux appels partent ensemble : le graphique et les cartes proviennent du
 * même rafraîchissement, donc jamais d'un mélange de deux états. Les réponses
 * périmées sont ignorées (même schéma que `usePositions`).
 *
 * Pas de rafraîchissement automatique : ces chiffres ne bougent qu'une fois par
 * jour, au passage du job de snapshot. `reload` sert au bouton « Actualiser ».
 */
export default function usePerformance(portfolioId) {
  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!portfolioId) {
      setMetrics(null);
      setHistory(null);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    try {
      const [nextMetrics, nextHistory] = await Promise.all([
        getPerformance(portfolioId),
        getPerformanceHistory(portfolioId),
      ]);
      if (id !== requestId.current) return;
      setMetrics(nextMetrics);
      setHistory(nextHistory);
      setError("");
    } catch (requestError) {
      if (id !== requestId.current) return;
      setError(describeError(requestError));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => () => {
    requestId.current += 1;
  }, []);

  return { metrics, history, loading, error, reload: load };
}
