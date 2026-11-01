import { useCallback, useEffect, useRef, useState } from "react";
import { searchSymbols } from "../../../services/marketService.js";

const DEBOUNCE_MS = 300;

/**
 * Recherche de paires Binance avec debounce.
 * Retourne les résultats de recherche et l'état de chargement.
 */
export default function useSymbolSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef(null);
  const latest = useRef("");

  const search = useCallback((q) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      latest.current = q;
      try {
        const { results: hits } = await searchSymbols(q.trim());
        // Ignorer si une autre recherche a déjà été lancée entre-temps
        if (latest.current !== q) return;
        setResults(hits);
      } catch {
        setResults([]);
      } finally {
        if (latest.current === q) setSearching(false);
      }
    }, DEBOUNCE_MS);
  }, []);

  const reset = useCallback(() => {
    setQuery("");
    setResults([]);
    setSearching(false);
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Nettoyage au démontage
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { query, results, searching, search, reset };
}
