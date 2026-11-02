import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "../../../config/supabaseClient.js";
import { marketApi } from "../api/marketApi.js";

export default function useMarketStream() {
  const [quotes, setQuotes] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const eventSource = useRef(null);
  const reconnectTimeout = useRef(null);

  const connect = useCallback(async () => {
    if (eventSource.current) return;

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      
      if (!token) {
        setError("Authentification requise pour le flux SSE");
        return;
      }

      const url = marketApi.getStreamUrl(token);
      eventSource.current = new EventSource(url);

      eventSource.current.onopen = () => {
        setIsConnected(true);
        setError(null);
        if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      };

      eventSource.current.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        setQuotes(payload.quotes || []);
      };

      eventSource.current.onerror = () => {
        setIsConnected(false);
        setError("Connexion au flux interrompue. Tentative de reconnexion...");
        eventSource.current.close();
        eventSource.current = null;
        reconnectTimeout.current = setTimeout(connect, 5000);
      };

    } catch (err) {
      setError("Erreur lors de l'initialisation du flux SSE");
      reconnectTimeout.current = setTimeout(connect, 10000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (eventSource.current) {
        eventSource.current.close();
        eventSource.current = null;
      }
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, [connect]);

  return { quotes, isConnected, error };
}
