import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../../services/apiClient.js";
import { getAllocation, getPositions } from "../../../services/positionsService.js";

const describeError = (error) =>
  error instanceof ApiError && error.status === 401
    ? "Connectez-vous pour consulter vos positions."
    : error.message || "Impossible de charger les positions.";

// Charge positions + répartition. Se recharge quand `refreshKey` change
// (la page Portefeuille le fait évoluer à chaque synchronisation, donc après
// chaque ordre exécuté). Les réponses périmées sont ignorées.
export default function usePositions(refreshKey) {
  const [positions, setPositions] = useState(null);
  const [allocation, setAllocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const [nextPositions, nextAllocation] = await Promise.all([
        getPositions("all"),
        getAllocation(),
      ]);
      if (id !== requestId.current) return;
      setPositions(nextPositions);
      setAllocation(nextAllocation);
      setError("");
    } catch (requestError) {
      if (id !== requestId.current) return;
      setError(describeError(requestError));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => () => {
    requestId.current += 1;
  }, []);

  return { positions, allocation, loading, error, reload: load };
}
