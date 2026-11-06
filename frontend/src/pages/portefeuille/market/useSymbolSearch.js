import { useCallback, useEffect, useRef, useState } from "react";
import { searchSymbols } from "../../../services/marketService.js";

const DEBOUNCE_MS = 300;

/**
 * Recherche d'actifs dans le marché choisi, avec debounce.
 * Une requête vide renvoie les suggestions du marché (paires populaires pour
 * la crypto, catalogue pour les actions / matières premières / devises).
 */
export default function useSymbolSearch(market = "crypto") {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef(null);
  const latest = useRef({ query: "", market });

  const search = useCallback((q) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    setSearching(true);
    const requestMarket = market;
    timer.current = setTimeout(async () => {
      latest.current = { query: q, market: requestMarket };
      try {
        const { results: hits } = await searchSymbols(q.trim(), requestMarket);
        // Ignorer si le marché ou la requête a changé entre-temps.
        if (latest.current.query !== q || latest.current.market !== requestMarket) return;
        setResults(hits);
      } catch {
        if (latest.current.query === q && latest.current.market === requestMarket) {
          setResults([]);
        }
      } finally {
        if (latest.current.query === q && latest.current.market === requestMarket) {
          setSearching(false);
        }
      }
    }, DEBOUNCE_MS);
  }, [market]);

  const reset = useCallback(() => {
    setQuery("");
    setResults([]);
    setSearching(false);
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Changer de marché vide la recherche et annule les résultats précédents.
  useEffect(() => {
    reset();
  }, [market, reset]);

  // Nettoyage au démontage
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { query, results, searching, search, reset };
}
