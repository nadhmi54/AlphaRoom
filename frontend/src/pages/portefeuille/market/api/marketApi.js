import { apiFetch } from "../../../services/apiClient.js";
import { API_URL } from "../../../config/env.js";
import { supabase } from "../../../config/supabaseClient.js";

// Construit l'URL d'export en ignorant les filtres vides (le backend refuse
// un paramètre présent mais vide, ex. ?symbol=).
function buildExportUrl(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return `${API_URL}/market/transactions/export.csv${qs ? `?${qs}` : ""}`;
}

export const marketApi = {
  getQuotes: () => apiFetch("/market/quotes"),
  getHistory: (symbol, range = "5m") => apiFetch("/market/history", { query: { symbol, range } }),

  getTransactions: (filters) => apiFetch("/market/transactions", { query: filters }),

  // L'endpoint est protégé par le guard JWT : on ne peut pas utiliser une
  // simple navigation (window.location), qui n'enverrait pas l'en-tête
  // Authorization. On récupère donc le fichier via fetch, puis on déclenche
  // le téléchargement à partir du blob.
  downloadTransactionsCsv: async (filters) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    const response = await fetch(buildExportUrl(filters), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      throw new Error(`Export impossible (erreur ${response.status})`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "transactions_marche.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  getMakerStatus: () => apiFetch("/market/maker/status"),
  startMaker: () => apiFetch("/market/maker/start", { method: "POST" }),
  stopMaker: () => apiFetch("/market/maker/stop", { method: "POST" }),

  // Le flux SSE ne peut pas porter d'en-tête personnalisé : le token passe
  // donc en paramètre de requête (le backend le valide côté guard).
  getStreamUrl: (token) => `${API_URL}/market/stream?token=${token}`,
};
