import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ModuleShell from "../../../components/ModuleShell/ModuleShell.jsx";
import { ApiError } from "../../../services/apiClient.js";
import {
  getTradingAssets,
  getTradingPortfolio,
  resetTradingPortfolio,
} from "../../../services/tradingService.js";
import "./M1MarchePage.css";
import "../cockpit/Cockpit.css";
import CockpitTabs from "../cockpit/CockpitTabs.jsx";
import EquityPanel from "../cockpit/EquityPanel.jsx";
import HistoryPanel from "../cockpit/HistoryPanel.jsx";
import PortfolioHero from "../cockpit/PortfolioHero.jsx";
import TickerTape from "../cockpit/TickerTape.jsx";
import Toasts from "../cockpit/Toasts.jsx";
import usePulse from "../cockpit/usePulse.js";
import useShortcuts from "../cockpit/useShortcuts.js";
import useToasts from "../cockpit/useToasts.js";
import LiveMarketPanel from "../market/LiveMarketPanel.jsx";
import useLiveMarket from "../market/useLiveMarket.js";
import OrderBookPanel from "../OrderBook/OrderBookPanel.jsx";
import PositionsPanel from "../positions/PositionsPanel.jsx";

// Intervalle du rafraîchissement automatique du portefeuille : les chiffres se
// mettent à jour sans recharger la page.
const LIVE_REFRESH_MS = 5000;

const EMPTY_FILTERS = { symbol: "", side: "", from: "", to: "" };
const TAB_STORAGE_KEY = "alpharoom.cockpit.tab";
const TAB_IDS = ["trader", "portfolio", "history"];

const describeError = (requestError) =>
  requestError instanceof ApiError && requestError.status === 401
    ? "Connectez-vous pour consulter et utiliser votre portefeuille virtuel."
    : requestError.message || "Impossible de charger les données du marché.";

// L'onglet choisi est retenu d'une visite à l'autre (si le navigateur le permet).
function readStoredTab() {
  try {
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
    return TAB_IDS.includes(stored) ? stored : "trader";
  } catch {
    return "trader";
  }
}

export default function M1MarchePage() {
  const [assets, setAssets] = useState([]);
  const [account, setAccount] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState("XAU/USD");
  const [range, setRange] = useState("5m");
  const [tab, setTabState] = useState(readStoredTab);
  const [focus, setFocus] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [lastSync, setLastSync] = useState(null);

  const market = useLiveMarket(selectedSymbol, range);
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  const pulse = usePulse(account?.portfolio?.totalValue, lastSync);

  const error = actionError || loadError;
  // Suit les requêtes en cours pour ne pas empiler les rafraîchissements auto.
  const pendingRequests = useRef(0);
  // Permet au minuteur de savoir s'il y a un compte à rafraîchir sans le
  // relancer à chaque mise à jour (sinon l'intervalle repartirait sans cesse).
  const hasAccount = useRef(false);

  useEffect(() => {
    hasAccount.current = Boolean(account);
  }, [account]);

  const setTab = useCallback((next) => {
    setTabState(next);
    if (next !== "trader") setFocus(false);
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {
      // Stockage indisponible : l'onglet ne sera simplement pas retenu.
    }
  }, []);

  // Recharge uniquement le portefeuille (assets et cotations ne changent pas).
  const syncAccount = useCallback(async () => {
    if (pendingRequests.current > 0) return;
    pendingRequests.current += 1;
    try {
      const nextAccount = await getTradingPortfolio({ ...filters, page, limit: 20 });
      setAccount(nextAccount);
      setLastSync(new Date());
      setLoadError("");
    } catch (requestError) {
      setLoadError(describeError(requestError));
    } finally {
      pendingRequests.current -= 1;
    }
  }, [filters, page]);

  // Chargement complet : utilisé au montage, au changement de filtre et après
  // une action (ordre, remise à zéro) pour refléter immédiatement le résultat.
  const refresh = useCallback(async () => {
    pendingRequests.current += 1;
    try {
      const [nextAssets, nextAccount] = await Promise.all([
        getTradingAssets(),
        getTradingPortfolio({ ...filters, page, limit: 20 }),
      ]);
      setAssets(nextAssets);
      setAccount(nextAccount);
      setLastSync(new Date());
      setLoadError("");
    } catch (requestError) {
      setLoadError(describeError(requestError));
    } finally {
      pendingRequests.current -= 1;
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Affichage en direct : rafraîchissement silencieux tant que l'onglet est
  // visible, plus une synchronisation immédiate au retour sur la page.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible" || !hasAccount.current) return;
      syncAccount();
    };
    const timer = window.setInterval(tick, LIVE_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [syncAccount]);

  // Échap ferme la confirmation de remise à zéro.
  useEffect(() => {
    if (!confirmReset) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setConfirmReset(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmReset]);

  // Plein écran : on fige le défilement de la page derrière le graphique.
  useEffect(() => {
    if (!focus) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [focus]);

  // Raccourcis : 1/2/3 changent d'onglet, F bascule le plein écran, Échap en sort.
  const shortcuts = useMemo(
    () => ({
      1: () => setTab("trader"),
      2: () => setTab("portfolio"),
      3: () => setTab("history"),
      f: () => {
        if (tab === "trader") setFocus((value) => !value);
      },
      escape: () => setFocus(false),
    }),
    [tab, setTab],
  );
  useShortcuts(shortcuts);

  async function handleReset() {
    setResetting(true);
    setActionError("");
    try {
      const nextAccount = await resetTradingPortfolio();
      setAccount(nextAccount);
      setLastSync(new Date());
      setLoadError("");
      setConfirmReset(false);
      pushToast({
        tone: "success",
        title: "Portefeuille réinitialisé",
        text: "100 000 $US de capital virtuel, positions et historique effacés.",
      });
      setFilters(EMPTY_FILTERS);
      setPage(1);
    } catch (requestError) {
      setConfirmReset(false);
      setActionError(requestError.message || "La réinitialisation a échoué.");
    } finally {
      setResetting(false);
    }
  }

  function updateFilter(key, value) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setPage(1);
    setFilters(EMPTY_FILTERS);
  }

  function selectFromTicker(symbol) {
    setSelectedSymbol(symbol);
    setTab("trader");
  }

  const openPositions = account?.positions?.filter((position) => position.quantity > 0).length ?? 0;
  const returnPercent = account?.portfolio?.returnPercent ?? 0;
  const mood = returnPercent > 0.005 ? "up" : returnPercent < -0.005 ? "down" : "flat";

  const tabs = [
    { id: "trader", label: "Trader" },
    { id: "portfolio", label: "Portefeuille", badge: account ? openPositions : null },
    { id: "history", label: "Historique", badge: account?.history?.total ?? null },
  ];

  return (
    <ModuleShell moduleId="portefeuille">
      <section className="ck-page" data-mood={mood} aria-busy={loading}>
        <TickerTape quotes={market.quotes} onSelect={selectFromTicker} />

        {error && (
          <div className="m1-message m1-message--error" role="alert">
            <span>{error}</span>
            {error.includes("Connectez-vous") && <Link to="/connexion">Se connecter</Link>}
          </div>
        )}

        {confirmReset && (
          <div
            className="m1-confirm"
            role="alertdialog"
            aria-labelledby="m1-reset-title"
            aria-describedby="m1-reset-desc"
          >
            <div>
              <strong id="m1-reset-title">Réinitialiser le portefeuille ?</strong>
              <p id="m1-reset-desc">
                Le cash revient à 100 000 $US. Les positions ouvertes et tout l’historique
                d’exécution seront définitivement effacés.
              </p>
            </div>
            <div className="m1-confirm-actions">
              <button
                type="button"
                className="m1-refresh"
                onClick={() => setConfirmReset(false)}
                disabled={resetting}
                autoFocus
              >
                Annuler
              </button>
              <button type="button" className="m1-confirm-danger" onClick={handleReset} disabled={resetting}>
                {resetting ? "Réinitialisation…" : "Confirmer la remise à zéro"}
              </button>
            </div>
          </div>
        )}

        <PortfolioHero
          account={account}
          loading={loading}
          lastSync={lastSync}
          pulse={pulse}
          resetting={resetting}
          onReset={() => setConfirmReset(true)}
        />

        <CockpitTabs tabs={tabs} active={tab} onChange={setTab} />

        {tab === "trader" && (
          <p className="ck-hints" aria-hidden="true">
            <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> onglets · <kbd>F</kbd> plein écran · <kbd>B</kbd> acheter · <kbd>S</kbd> vendre
          </p>
        )}

        <div
          key={tab}
          className="ck-panel"
          role="tabpanel"
          id={`ck-panel-${tab}`}
          aria-labelledby={`ck-tab-${tab}`}
        >
          {tab === "trader" && (
            <>
              <LiveMarketPanel
                market={market}
                symbol={selectedSymbol}
                onSymbolChange={setSelectedSymbol}
                range={range}
                onRangeChange={setRange}
                assets={assets}
                account={account}
                onExecuted={syncAccount}
                onToast={pushToast}
                focus={focus}
                onFocusChange={setFocus}
              />
              {/* Carnet d'ordres (moteur d'exécution) : composant autonome. Le
                  choix de l'actif est partagé avec le graphique au-dessus. C'est
                  ici que se passent les ordres limite. */}
              <OrderBookPanel
                symbol={selectedSymbol}
                assets={assets}
                onSymbolChange={setSelectedSymbol}
                onExecuted={syncAccount}
              />
            </>
          )}

          {tab === "portfolio" && (
            <>
              <PositionsPanel refreshKey={lastSync} assets={assets} onExecuted={syncAccount} />
              <EquityPanel account={account} />
            </>
          )}

          {tab === "history" && (
            <HistoryPanel
              account={account}
              assets={assets}
              filters={filters}
              onFilter={updateFilter}
              onClear={clearFilters}
              page={page}
              onPage={setPage}
              loading={loading}
              onRefresh={refresh}
            />
          )}
        </div>

        <p className="ck-disclaimer">
          Simulateur pédagogique · montants en USD · aucun ordre n’est envoyé sur un marché réel.
        </p>
      </section>
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </ModuleShell>
  );
}
