import { useCallback, useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import ModuleShell from '../../components/ModuleShell/ModuleShell.jsx';
import CoachWidget from '../../components/CoachWidget/CoachWidget.jsx';
import MarketAnalystPanel from '../../components/MarketAnalyst/MarketAnalystPanel.jsx';
import LiveClassPanel from '../../components/LiveClass/LiveClassPanel.jsx';
import ShockProjectionPanel from '../../components/ShockProjection/ShockProjectionPanel.jsx';
import { useAuth } from '../../context/useAuth.js';
import GrHeader from './GrHeader.jsx';
import GrPortfolio from './GrPortfolio.jsx';
import GrChart from './GrChart.jsx';
import GrOrderBook from './GrOrderBook.jsx';
import GrTradePanel from './GrTradePanel.jsx';
import GrPositions from './GrPositions.jsx';
import GrMasterPanel from './GrMasterPanel.jsx';
import GrCreateRoomModal from './GrCreateRoomModal.jsx';
import { assetDecimals, assetUnitShort } from '../../data/roomAssets.js';
import {
  getDemoRoom,
  getAllGameRooms,
  getMyRooms,
  getGameRoomDetails,
  getGameRoomPortfolio,
  placeSimOrder,
  closeSimPosition,
  controlGameRoom,
  triggerGameMasterAction,
  getGameRoomDashboard,
  joinGameRoom,
  setRoomSpeed,
  seekRoom,
} from '../../services/gameRoomService.js';
import './GameRoomPage.css';

const SYNC_INTERVAL_MS = 2500;

const SOURCE_LABELS = {
  scenario: 'Scénario pédagogique',
  synthetic: 'Marché synthétique',
  historical: 'Données historiques',
  csv: 'Import CSV',
  live: 'Marché en direct',
};

export default function GameRoomPage() {
  const { profile, session } = useAuth();
  const userId = profile?.id || session?.user?.id;
  const [roomData, setRoomData] = useState(null);
  const [portfolioData, setPortfolioData] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [myRooms, setMyRooms] = useState([]);
  const [activeSymbol, setActiveSymbol] = useState(null);

  const [error, setError] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [_loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [latestEventBanner, setLatestEventBanner] = useState(null);

  const [selectedBookPrice, setSelectedBookPrice] = useState(null);
  const [selectedBookSide, setSelectedBookSide] = useState('buy');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  // Modal pour rejoindre une autre salle
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinNicknameInput, setJoinNicknameInput] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Lobby Trader : vrai tant que le trader n'a pas sélectionné de salle
  const [showTraderLobby, setShowTraderLobby] = useState(false);
  // Données des salles publiques chargées dans le lobby (au minimum la salle démo)
  const [lobbyRooms, setLobbyRooms] = useState([]);

  const activeRoomIdRef = useRef(null);
  const previousEventsCountRef = useRef(0);

  const isMasterRole = profile?.role === 'game_master' || profile?.role === 'admin';

  // Panneau enseignant visible pour les comptes Meneur de Jeu/Admin, et pour un
  // trader dans la salle personnelle qu'il a lui-même créée (room.isMaster côté serveur).
  const isMaster = Boolean(roomData?.room?.isMaster);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  // Sauvegarde de la salle active dans le localStorage et synchronisation de l'URL
  const saveActiveRoomId = useCallback(
    (roomId) => {
      if (!roomId) return;
      try {
        if (userId) window.localStorage.setItem(`alpharoom:game-room:active-id:${userId}`, roomId);
        window.localStorage.setItem('alpharoom:game-room:last-id', roomId);
      } catch {
        // Ignorer si localStorage restreint
      }
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('roomId') !== roomId) {
          url.searchParams.set('roomId', roomId);
          window.history.replaceState(null, '', url.pathname + url.search);
        }
      } catch {
        // Ignorer si environnement sans URL
      }
    },
    [userId],
  );

  const clearActiveRoomId = useCallback(() => {
    try {
      if (userId) {
        window.localStorage.removeItem(`alpharoom:game-room:active-id:${userId}`);
      }
      window.localStorage.removeItem('alpharoom:game-room:last-id');
    } catch {
      // Ignorer
    }
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('roomId')) {
        url.searchParams.delete('roomId');
        window.history.replaceState(null, '', url.pathname + (url.search || ''));
      }
    } catch {
      // Ignorer
    }
  }, [userId]);

  // Chargement complet d'une salle donnée (marché, portefeuille, tableau de bord)
  const loadRoom = useCallback(
    async (roomId, symbol) => {
      const details = await getGameRoomDetails(roomId, symbol);
      activeRoomIdRef.current = roomId;
      saveActiveRoomId(roomId);
      setActiveSymbol(details.room?.activeSymbol ?? null);
      setRoomData(details);

      const [pf, dash] = await Promise.all([
        getGameRoomPortfolio(roomId),
        details.room?.isMaster
          ? getGameRoomDashboard(roomId).catch(() => null)
          : Promise.resolve(null),
      ]);
      setPortfolioData(pf);
      setDashboardData(dash);
      return details;
    },
    [saveActiveRoomId],
  );

  const refreshMyRooms = useCallback(async () => {
    if (!isMasterRole) return [];
    const mine = await getMyRooms();
    const rooms = mine.rooms || [];
    setMyRooms(rooms);
    return rooms;
  }, [isMasterRole]);

  // Chargement initial : salle persistée (URL ou localStorage), sinon salles du Meneur de Jeu, sinon salle démo
  const initRoom = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // 1. Chercher si une salle était déjà sélectionnée (URL ou localStorage)
      let savedRoomId = null;
      try {
        const params = new URLSearchParams(window.location.search);
        savedRoomId = params.get('roomId') || params.get('room');
      } catch {
        // Ignorer
      }
      if (!savedRoomId) {
        try {
          const userKey = userId ? `alpharoom:game-room:active-id:${userId}` : null;
          savedRoomId =
            (userKey ? window.localStorage.getItem(userKey) : null) ||
            window.localStorage.getItem('alpharoom:game-room:last-id');
        } catch {
          // Ignorer
        }
      }

      if (isMasterRole) {
        await refreshMyRooms().catch(() => []);
      }

      if (savedRoomId) {
        try {
          // Idempotent : garantit l'inscription étudiant même si la salle
          // avait été ouverte sans passer par « Rejoindre ».
          if (!isMasterRole) {
            await joinGameRoom(savedRoomId, profile?.fullName || 'Étudiant').catch(() => null);
          }
          await loadRoom(savedRoomId);
          return;
        } catch {
          // La salle sauvegardée n'existe plus ou est inaccessible
          clearActiveRoomId();
        }
      }

      // 2. Si meneur de jeu avec des salles, charger la première salle en cours ou créée
      if (isMasterRole) {
        const mine = await getMyRooms().catch(() => ({ rooms: [] }));
        const rooms = mine.rooms || [];
        setMyRooms(rooms);
        const preferred = rooms.find((room) => room.status === 'running') || rooms[0];
        if (preferred) {
          await loadRoom(preferred.id);
          return;
        }
      }

      // 3. Trader sans salle sauvegardée → afficher le lobby (toutes les salles de simulation disponibles)
      if (!isMasterRole) {
        let roomsList = [];
        try {
          const res = await getAllGameRooms();
          roomsList = res?.rooms || [];
        } catch {
          // Ignorer si échec
        }
        if (roomsList.length === 0) {
          const demo = await getDemoRoom().catch(() => null);
          if (demo?.room) roomsList = [demo.room];
        }
        setLobbyRooms(roomsList);
        setShowTraderLobby(true);
        return;
      }

      // 4. Fallback Master sans salle → salle de démonstration par défaut
      const initial = await getDemoRoom();
      activeRoomIdRef.current = initial.room.id;
      saveActiveRoomId(initial.room.id);
      setActiveSymbol(initial.room?.activeSymbol ?? initial.market?.symbol ?? null);
      setRoomData(initial);

      const [pf, dash] = await Promise.all([
        getGameRoomPortfolio(initial.room.id),
        initial.room?.isMaster
          ? getGameRoomDashboard(initial.room.id).catch(() => null)
          : Promise.resolve(null),
      ]);
      setPortfolioData(pf);
      if (dash) setDashboardData(dash);
    } catch (err) {
      setError(err.message || 'Impossible de charger la salle de simulation.');
    } finally {
      setLoading(false);
    }
  }, [isMasterRole, loadRoom, refreshMyRooms, userId, saveActiveRoomId, clearActiveRoomId]);

  useEffect(() => {
    initRoom();
  }, []);

  // Synchronisation continue du marché et détection des événements diffusés
  const syncRoom = useCallback(async () => {
    const roomId = activeRoomIdRef.current;
    if (!roomId) return;
    try {
      const userIsMaster = Boolean(roomData?.room?.isMaster);

      const [updatedDetails, updatedPf] = await Promise.all([
        getGameRoomDetails(roomId, activeSymbol),
        getGameRoomPortfolio(roomId),
      ]);
      setRoomData(updatedDetails);
      setPortfolioData(updatedPf);

      if (userIsMaster) {
        const updatedDash = await getGameRoomDashboard(roomId);
        setDashboardData(updatedDash);
      }

      // Si un nouvel événement ou news a été déclenché par l'enseignant, l'afficher à l'élève
      const recentEvts = updatedDetails.recentEvents || [];
      if (recentEvts.length > 0 && recentEvts.length > previousEventsCountRef.current) {
        const newest = recentEvts[0];
        setLatestEventBanner(newest);
      }
      previousEventsCountRef.current = recentEvts.length;
    } catch {
      // Ignorer silencieusement les erreurs de polling
    }
  }, [isMasterRole, roomData?.room?.isMaster, activeSymbol]);

  useEffect(() => {
    const timer = setInterval(() => {
      syncRoom();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [syncRoom]);

  // Création d'une salle par le Meneur de Jeu
  const handleRoomCreated = async (room) => {
    setShowCreateModal(false);
    try {
      await refreshMyRooms().catch(() => {});
      await loadRoom(room.id);
      showToast(
        `Salle « ${room.name} » créée. Code de participation : ${room.joinCode}`,
        'success',
      );
    } catch (err) {
      setError(err.message || 'Salle créée mais impossible à charger.');
    }
  };

  const handleSelectRoom = async (roomId) => {
    if (!roomId || roomId === activeRoomIdRef.current) return;
    try {
      setLoading(true);
      setSelectedStudentId(null);
      previousEventsCountRef.current = 0;
      await loadRoom(roomId);
    } catch (err) {
      showToast(err.message || 'Impossible d’ouvrir cette salle.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeSymbol = async (symbol) => {
    setActiveSymbol(symbol);
    const roomId = activeRoomIdRef.current;
    if (!roomId) return;
    try {
      const details = await getGameRoomDetails(roomId, symbol);
      setRoomData(details);
    } catch {
      // Le polling suivant réessaiera
    }
  };

  // Passage d'un ordre simulé (Étudiant)
  const handlePlaceOrder = async (orderPayload) => {
    if (!roomData?.room?.id) return;
    setIsSubmitting(true);
    try {
      const res = await placeSimOrder(roomData.room.id, orderPayload);
      const actionWord = orderPayload.side === 'buy' ? 'Acheté' : 'Vendu';
      showToast(
        `${actionWord} ${orderPayload.quantity} ${orderPayload.symbol} à ${res.executedPrice ?? orderPayload.limitPrice}`,
        'success',
      );
      await syncRoom();
    } catch (err) {
      showToast(err.message || 'Erreur lors de la soumission de l’ordre', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Clôture d'une position (Étudiant)
  const handleClosePosition = async (symbol) => {
    if (!roomData?.room?.id) return;
    setIsClosing(true);
    try {
      await closeSimPosition(roomData.room.id, symbol);
      showToast(`Position clôturée avec succès sur ${symbol}.`, 'success');
      await syncRoom();
    } catch (err) {
      showToast(err.message || 'Erreur lors de la clôture', 'error');
    } finally {
      setIsClosing(false);
    }
  };

  // Contrôles formateur (Play / Pause / Reset) - Réservé au Meneur de jeu
  const handleControlRoom = async (action) => {
    if (!roomData?.room?.id) return;
    try {
      await controlGameRoom(roomData.room.id, action);
      const labels = {
        start: 'Séance démarrée ! Les prix et le chronomètre défilent.',
        pause: 'Séance mise en pause.',
        resume: 'Séance reprise.',
        reset: 'Salle réinitialisée au départ (Minute 0, capital initial restauré).',
        finish: 'Séance terminée. Les étudiants voient le bilan final.',
      };
      showToast(labels[action] || 'Action exécutée.', 'success');
      await syncRoom();
    } catch (err) {
      showToast(err.message || 'Erreur d’action', 'error');
    }
  };

  // Vitesse de relecture et curseur de séance (Meneur de jeu)
  const handleSetSpeed = async (speed) => {
    if (!roomData?.room?.id) return;
    try {
      await setRoomSpeed(roomData.room.id, speed);
      showToast(`Vitesse de relecture réglée à x${speed}.`, 'success');
      await syncRoom();
    } catch (err) {
      showToast(err.message || 'Impossible de modifier la vitesse.', 'error');
    }
  };

  const handleSeek = async (seconds) => {
    if (!roomData?.room?.id) return;
    try {
      await seekRoom(roomData.room.id, Math.max(0, Math.round(seconds)));
      showToast(`Curseur déplacé à ${Math.round(seconds / 60)} min de simulation.`, 'success');
      await syncRoom();
    } catch (err) {
      showToast(err.message || 'Impossible de déplacer le curseur.', 'error');
    }
  };

  // Actions Game Master (Chocs, News, Rollback) - Réservé au Meneur de jeu
  const handleTriggerAction = async (actionPayload) => {
    if (!roomData?.room?.id) return;
    try {
      const payloadWithSymbol = {
        ...actionPayload,
        symbol: actionPayload.symbol || actionPayload.payload?.symbol || symbol,
        payload: {
          symbol: actionPayload.payload?.symbol || symbol,
          ...(actionPayload.payload || {}),
        },
      };
      await triggerGameMasterAction(roomData.room.id, payloadWithSymbol);
      showToast(`Événement déclenché : ${actionPayload.title}`, 'info');
      await syncRoom();
    } catch (err) {
      showToast(err.message || 'Erreur lors du déclenchement', 'error');
    }
  };

  // Rejoindre une autre salle
  const handleJoinOtherRoom = async (e) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    try {
      setLoading(true);
      const res = await joinGameRoom(joinCodeInput.trim(), joinNicknameInput.trim());
      setShowJoinModal(false);
      setJoinCodeInput('');
      setJoinNicknameInput('');
      previousEventsCountRef.current = 0;
      await loadRoom(res.room.id);
      showToast(`Connecté à la salle : ${res.room.name}`, 'success');
    } catch (err) {
      showToast(err.message || 'Salle introuvable avec ce code', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Revenir au lobby des salles de simulation (Trader)
  const handleOpenLobby = async () => {
    try {
      setLoading(true);
      clearActiveRoomId();
      let roomsList = [];
      try {
        const res = await getAllGameRooms();
        roomsList = res?.rooms || [];
      } catch {
        // Fallback
      }
      if (roomsList.length === 0) {
        const demo = await getDemoRoom().catch(() => null);
        if (demo?.room) roomsList = [demo.room];
      }
      setLobbyRooms(roomsList);
      setShowTraderLobby(true);
      setShowJoinModal(false);
    } finally {
      setLoading(false);
    }
  };

  // Revenir à la salle démo initiale
  const handleResetToDemoRoom = async () => {
    try {
      setLoading(true);
      clearActiveRoomId();
      const initial = await getDemoRoom();
      activeRoomIdRef.current = initial.room.id;
      saveActiveRoomId(initial.room.id);
      setActiveSymbol(initial.room?.activeSymbol ?? initial.market?.symbol ?? null);
      setRoomData(initial);

      const [pf, dash] = await Promise.all([
        getGameRoomPortfolio(initial.room.id),
        initial.room?.isMaster
          ? getGameRoomDashboard(initial.room.id).catch(() => null)
          : Promise.resolve(null),
      ]);
      setPortfolioData(pf);
      if (dash) setDashboardData(dash);
      setShowJoinModal(false);
      showToast('Retour à la salle de démonstration : Le mardi de la panique', 'info');
    } catch (err) {
      showToast(err.message || 'Impossible de charger la salle de démo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Entrer dans une salle depuis le lobby Trader
  const handleEnterRoomFromLobby = async (roomId) => {
    try {
      setLoading(true);
      // L'entrée par carte vaut inscription : sans participant enregistré,
      // les routes IA (analyste, coach, projection) répondent « tu n'y participes pas ».
      if (!isMasterRole) {
        await joinGameRoom(roomId, joinNicknameInput.trim() || profile?.fullName || 'Étudiant');
      }
      setShowTraderLobby(false);
      await loadRoom(roomId);
    } catch (err) {
      showToast(err.message || 'Impossible d\'ouvrir cette salle.', 'error');
      setShowTraderLobby(true);
    } finally {
      setLoading(false);
    }
  };

  // Rejoindre depuis le lobby (via code) puis fermer le lobby
  const handleLobbyJoin = async (e) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    try {
      setLoading(true);
      const res = await joinGameRoom(joinCodeInput.trim(), joinNicknameInput.trim());
      setShowTraderLobby(false);
      setJoinCodeInput('');
      setJoinNicknameInput('');
      previousEventsCountRef.current = 0;
      await loadRoom(res.room.id);
      showToast(`Connecté à la salle : ${res.room.name}`, 'success');
    } catch (err) {
      showToast(err.message || 'Salle introuvable avec ce code', 'error');
    } finally {
      setLoading(false);
    }
  };

  const room = roomData?.room;
  const market = roomData?.market;
  const currency = room?.currency === 'EUR' ? '€' : '$US';
  const symbol = market?.symbol || activeSymbol || room?.assets?.[0] || 'XAU/USD';

  const currentHeld = portfolioData?.positions?.find((p) => p.symbol === symbol)?.quantity || 0;
  const avgBuy = portfolioData?.positions?.find((p) => p.symbol === symbol)?.averagePrice || null;

  // Étudiant actuellement sélectionné par le Meneur de Jeu pour inspection
  const activeStudent =
    dashboardData?.leaderboard?.find((s) => s.userId === selectedStudentId) ||
    dashboardData?.leaderboard?.[0] ||
    null;

  return (
    <ModuleShell moduleId="game-room">
      <div className="gr-page">
        {/* Toast de notification */}
        {toast && (
          <div className={`gr-toast gr-toast--${toast.type}`} role="alert">
            <span>{toast.message}</span>
            <button type="button" onClick={() => setToast(null)}>✕</button>
          </div>
        )}

        {/* Message d'erreur */}
        {error && (
          <div className="gr-error-banner" role="alert">
            <span>{error}</span>
            {error.includes('Connectez-vous') && (
              <Link to="/connexion" className="gr-btn gr-btn--login">Se connecter</Link>
            )}
          </div>
        )}

        {/* BANNIÈRE D'ÉVÉNEMENT EN DIRECT (Reçue par les étudiants quand l'enseignant déclenche un choc ou une news) */}
        {latestEventBanner && (
          <div className="gr-live-event-banner" role="alert">
            <div className="gr-live-event-banner__content">
              <span className="gr-live-event-badge">⚡ ÉVÉNEMENT DU MARCHÉ</span>
              <strong>{latestEventBanner.title}</strong>
              {latestEventBanner.description && <p>{latestEventBanner.description}</p>}
            </div>
            <button
              type="button"
              className="gr-live-event-close"
              onClick={() => setLatestEventBanner(null)}
              title="Fermer la notification"
            >
              ✕
            </button>
          </div>
        )}

        {/* LOBBY TRADER : sélection de la salle avant d'entrer */}
        {showTraderLobby && !isMasterRole && (
          <div className="gr-trader-lobby">
            <div className="gr-trader-lobby__header">
              <span className="gr-eyebrow">SALLES DE SIMULATION DISPONIBLES</span>
              <h2 className="gr-trader-lobby__title">Choisissez votre salle</h2>
              <p className="gr-trader-lobby__subtitle">
                Sélectionnez une salle ci-dessous ou collez le code fourni par votre formateur pour rejoindre sa séance.
              </p>
            </div>

            {/* Cartes des salles disponibles */}
            <div className="gr-trader-lobby__rooms">
              {lobbyRooms.map((lobbyRoom) => (
                <button
                  key={lobbyRoom.id}
                  type="button"
                  className="gr-trader-lobby__room-card"
                  onClick={() => handleEnterRoomFromLobby(lobbyRoom.id)}
                >
                  <div className="gr-trader-lobby__room-badge">
                    <span className={`gr-status gr-status--${lobbyRoom.status || 'running'}`}>
                      <i className="gr-status__dot" aria-hidden="true" />
                      {lobbyRoom.status === 'waiting' ? 'En attente'
                        : lobbyRoom.status === 'paused' ? 'En pause'
                        : lobbyRoom.status === 'finished' ? 'Terminée'
                        : 'En cours'}
                    </span>
                    <span className="gr-trader-lobby__room-tag">🎓 Démonstration</span>
                  </div>
                  <strong className="gr-trader-lobby__room-name">{lobbyRoom.name}</strong>
                  {lobbyRoom.description && (
                    <p className="gr-trader-lobby__room-desc">{lobbyRoom.description}</p>
                  )}
                  <div className="gr-trader-lobby__room-meta">
                    {lobbyRoom.assets?.length > 0 && (
                      <span>📊 {lobbyRoom.assets.join(', ')}</span>
                    )}
                    {lobbyRoom.durationMinutes && (
                      <span>⏱ {lobbyRoom.durationMinutes} min</span>
                    )}
                    {lobbyRoom.initialCapital && (
                      <span>
                        💰 {Number(lobbyRoom.initialCapital).toLocaleString('fr-FR')}{' '}
                        {lobbyRoom.currency === 'EUR' ? '€' : '$US'}
                      </span>
                    )}
                  </div>
                  {lobbyRoom.joinCode && (
                    <div className="gr-trader-lobby__room-code">
                      Code : <strong>{lobbyRoom.joinCode}</strong>
                      <button
                        type="button"
                        className="gr-trader-lobby__copy-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard?.writeText(lobbyRoom.joinCode);
                          setJoinCodeInput(lobbyRoom.joinCode);
                          showToast(`Code ${lobbyRoom.joinCode} copié et collé dans « Rejoindre la salle » !`);
                        }}
                        title="Copier et coller le code"
                      >
                        📋 Copier
                      </button>
                    </div>
                  )}
                  <span className="gr-trader-lobby__room-enter">Entrer dans la salle →</span>
                </button>
              ))}
            </div>

            {/* Zone rejoindre avec un code */}
            <div className="gr-trader-lobby__join-panel">
              <div className="gr-trader-lobby__join-header">
                <span className="gr-eyebrow">REJOINDRE UNE SALLE</span>
                <p>Collez le code partagé par votre formateur pour rejoindre sa séance.</p>
              </div>
              <form className="gr-trader-lobby__join-form" onSubmit={handleLobbyJoin}>
                <div className="gr-trader-lobby__join-fields">
                  <input
                    type="text"
                    className="gr-input gr-trader-lobby__code-input"
                    placeholder="Code de la salle (ex : PANIC1)"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                  <input
                    type="text"
                    className="gr-input gr-trader-lobby__nick-input"
                    placeholder="Votre prénom ou pseudo"
                    value={joinNicknameInput}
                    onChange={(e) => setJoinNicknameInput(e.target.value)}
                  />
                  <button type="submit" className="gr-btn gr-btn--primary gr-trader-lobby__join-btn">
                    🔑 Rejoindre
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* BARRE D'INDICATEUR DE STATUT */}
        {!showTraderLobby && (
          <div className="gr-sub-bar">
          <div className="gr-sub-bar__left">
            <span className="gr-live-indicator">
              <span className="gr-live-indicator__pulse" />
              SIMULATION SYNCHRONISÉE EN DIRECT
            </span>
            <span className="gr-role-indicator-badge">
              {isMaster ? '👨‍🏫 Session Meneur de Jeu' : '🎓 Session Étudiant'}
            </span>
          </div>
          <div className="gr-sub-bar__right">
            {!isMasterRole && (
              <>
                <button
                  type="button"
                  className="gr-btn gr-btn--secondary"
                  onClick={handleOpenLobby}
                >
                  🏛 Toutes les salles
                </button>
                <button
                  type="button"
                  className="gr-btn gr-btn--join"
                  onClick={() => setShowJoinModal(true)}
                >
                  Rejoindre une autre salle 🔑
                </button>
                <button
                  type="button"
                  className="gr-btn gr-btn--create"
                  onClick={() => setShowCreateModal(true)}
                >
                  + Créer une salle
                </button>
              </>
            )}
            {isMasterRole && (
              <button
                type="button"
                className="gr-btn gr-btn--create"
                onClick={() => setShowCreateModal(true)}
              >
                + Créer une salle
              </button>
            )}
          </div>
        </div>
        )}

        {/* SÉLECTEUR DE SALLE · MENEUR DE JEU */}
        {isMasterRole && (
          <div className="gr-room-switcher">
            <div className="gr-room-switcher__head">
              <span className="gr-eyebrow">MES SALLES DE SIMULATION ({myRooms.length})</span>
              <span className="gr-room-switcher__tip">
                La configuration d’une salle ne peut plus être modifiée une fois la séance lancée.
              </span>
            </div>

            {myRooms.length === 0 ? (
              <p className="gr-room-switcher__empty">
                Aucune salle créée pour l’instant. Utilisez « + Créer une salle » pour configurer
                la source de marché, la durée, le capital et les règles de risque de votre séance.
              </p>
            ) : (
              <div className="gr-room-cards">
                {myRooms.map((item) => {
                  const isActive = item.id === room?.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`gr-room-card ${isActive ? 'is-active' : ''}`}
                      onClick={() => handleSelectRoom(item.id)}
                      title={item.description || item.name}
                    >
                      <span className={`gr-status gr-status--${item.status}`}>
                        <i className="gr-status__dot" aria-hidden="true" />
                        {item.status === 'waiting' ? 'En attente'
                          : item.status === 'running' ? 'En cours'
                          : item.status === 'paused' ? 'En pause' : 'Terminée'}
                      </span>
                      <strong>{item.name}</strong>
                      <small>
                        Code {item.joinCode} · {SOURCE_LABELS[item.sourceMode] || item.sourceMode}
                      </small>
                      <small>
                        {item.assets?.join(', ')} · {item.durationMinutes} min réelles (x{item.playbackSpeed})
                        · {Number(item.initialCapital).toLocaleString('fr-FR')} {item.currency}
                      </small>
                      <small className="gr-room-card__meta">
                        {item.participantsCount}/{item.maxParticipants} participants
                        {item.currentPrice ? ` · ${item.currentPrice} ` : ''}
                      </small>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {roomData && (
          <>
            {/* EN-TÊTE COMMUN DE LA SALLE */}
            <GrHeader
              room={roomData.room}
              market={roomData.market}
              participantsCount={roomData.participantsCount}
              currency={currency}
              sourceLabel={SOURCE_LABELS[roomData.room?.sourceMode] || 'Scénario pédagogique'}
              onJoinCodeClick={(code) => {
                navigator.clipboard?.writeText(code);
                showToast(`Code ${code} copié dans le presse-papier !`);
              }}
            />

            {/* SÉLECTEUR D'ACTIF (salles multi-actifs) */}
            {(room?.assets?.length ?? 0) > 1 && (
              <div className="gr-symbol-tabs" role="tablist" aria-label="Actifs de la salle">
                {room.assets.map((assetSymbol) => {
                  const quote = market?.symbols?.find((item) => item.symbol === assetSymbol);
                  return (
                    <button
                      key={assetSymbol}
                      type="button"
                      role="tab"
                      aria-selected={assetSymbol === symbol}
                      className={`gr-symbol-tab ${assetSymbol === symbol ? 'is-active' : ''}`}
                      onClick={() => handleChangeSymbol(assetSymbol)}
                    >
                      <strong>{assetSymbol}</strong>
                      {quote?.price != null && (
                        <span>{Number(quote.price).toFixed(assetDecimals(assetSymbol))} {currency}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* =========================================================================
                VUE 1 : INTERFACE ÉTUDIANT (Trader / Client normal)
                L'étudiant ne voit que son propre portefeuille, son graphique, son carnet,
                sa zone de trading et son coach IA.
               ========================================================================= */}
            {!isMaster && (
              <div className="gr-student-view">
                {/* Son Portefeuille Virtuel Indépendant */}
                <GrPortfolio portfolio={portfolioData?.portfolio} currency={currency} />

                {/* Analyste de marché IA : lecture des prix et des événements de la salle */}
                <MarketAnalystPanel roomId={roomData?.room?.id} />

                {/* Projection IA après un choc : apparaît toute seule quand un choc survient */}
                <ShockProjectionPanel roomId={roomData?.room?.id} />

                {/* Scène de Marché : Graphique + Carnet + Trading */}
                <div className="gr-main-grid">
                  <div className="gr-main-grid__chart-col">
                    <GrChart
                      series={roomData.market?.series}
                      symbol={symbol}
                      currency={currency}
                      totalSeconds={room?.totalSimSeconds}
                      averageBuyPrice={avgBuy}
                      currentPrice={roomData.market?.price}
                      events={roomData.recentEvents}
                    />

                    {/* Tableau des positions personnelles de l'étudiant */}
                    <GrPositions
                      positions={portfolioData?.positions}
                      trades={portfolioData?.trades}
                      currency={currency}
                      onClosePosition={handleClosePosition}
                      isClosing={isClosing}
                    />
                  </div>

                  <div className="gr-main-grid__side-col">
                    {/* Zone de Trading Étudiant */}
                    <GrTradePanel
                      symbol={symbol}
                      unit={assetUnitShort(symbol)}
                      currency={currency}
                      decimals={assetDecimals(symbol)}
                      assets={room?.assets}
                      leverage={room?.leverage}
                      commissionPercent={room?.commissionPercent}
                      allowShortSelling={room?.allowShortSelling}
                      riskLimitPercent={room?.riskLimitPercent}
                      maxExposure={room?.maxExposure}
                      marketPrice={roomData.market?.price}
                      cash={portfolioData?.portfolio?.cash}
                      heldQuantity={currentHeld}
                      selectedPrice={selectedBookPrice}
                      selectedSide={selectedBookSide}
                      onSelectSymbol={handleChangeSymbol}
                      onSubmitOrder={handlePlaceOrder}
                      isSubmitting={isSubmitting}
                    />

                    {/* Carnet d'ordres simulé */}
                    <GrOrderBook
                      book={roomData.book}
                      symbol={symbol}
                      currency={currency}
                      decimals={assetDecimals(symbol)}
                      onSelectPrice={(price, s) => {
                        setSelectedBookPrice(price);
                        setSelectedBookSide(s);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* =========================================================================
                VUE 2 : INTERFACE MENEUR DE JEU (Enseignant / Formateur)
                Affichée DIRECTEMENT et UNIQUEMENT lorsque l'utilisateur est le Meneur de jeu.
                Contient : Contrôle du temps, Chocs, Rollback, et Supervision complète
                des portefeuilles de tous les élèves (Leaderboard).
               ========================================================================= */}
            {isMaster && (
              <div className="gr-master-view">
                {/* Portefeuille du propriétaire-trader : casquette maître ET trader */}
                {!isMasterRole && (
                  <GrPortfolio portfolio={portfolioData?.portfolio} currency={currency} />
                )}

                {/* Panneau de contrôle exclusif du Formateur avec Leaderboard */}
                <GrMasterPanel
                  room={roomData.room}
                  dashboard={dashboardData}
                  currency={currency}
                  symbol={symbol}
                  onControlRoom={handleControlRoom}
                  onTriggerAction={handleTriggerAction}
                  onSetSpeed={handleSetSpeed}
                  onSeek={handleSeek}
                  selectedStudentId={activeStudent?.userId}
                  onSelectStudent={(id) => setSelectedStudentId(id)}
                />

                {/* Suivi de classe : réservé au rôle enseignant (endpoint élève du rôle).
                    Analyste et projection : accessibles aussi au trader-propriétaire,
                    participant de sa propre salle. */}
                {isMasterRole && <LiveClassPanel roomId={roomData?.room?.id} />}
                <MarketAnalystPanel roomId={roomData?.room?.id} />
                <ShockProjectionPanel roomId={roomData?.room?.id} />

                {/* Graphique et Carnet pour surveiller les mouvements de marché de la classe */}
                <div className="gr-main-grid gr-main-grid--master">
                  <div className="gr-main-grid__chart-col">
                    <GrChart
                      series={roomData.market?.series}
                      symbol={symbol}
                      currency={currency}
                      totalSeconds={room?.totalSimSeconds}
                      currentPrice={roomData.market?.price}
                      events={roomData.recentEvents}
                    />

                    {/* Zone de trading du propriétaire-trader : ses positions et son historique */}
                    {!isMasterRole && (
                      <GrPositions
                        positions={portfolioData?.positions}
                        trades={portfolioData?.trades}
                        currency={currency}
                        onClosePosition={handleClosePosition}
                        isClosing={isClosing}
                      />
                    )}

                    {/* SUPERVISION INDIVIDUELLE : réservé au compte enseignant. Un trader
                        propriétaire d'une salle personnelle n'a pas de classe à superviser. */}
                    {isMasterRole && (
                    <div className="gr-master-student-details">
                      <div className="gr-inspector-bar">
                        <div className="gr-inspector-bar__info">
                          <span className="gr-eyebrow">SUPERVISION INDIVIDUELLE · ÉTUDIANT TRADER</span>
                          <h4>
                            {activeStudent
                              ? `Positions & Ordres de : ${activeStudent.nickname} (${activeStudent.totalValue.toLocaleString('fr-FR')} ${currency})`
                              : 'En attente de participants étudiants...'}
                          </h4>
                        </div>
                        {dashboardData?.leaderboard?.length > 1 && (
                          <div className="gr-inspector-bar__picker">
                            <label htmlFor="studentPicker">Changer d’étudiant :</label>
                            <select
                              id="studentPicker"
                              className="gr-select gr-select--sm"
                              value={activeStudent?.userId || ''}
                              onChange={(e) => setSelectedStudentId(e.target.value)}
                            >
                              {dashboardData.leaderboard.map((st, idx) => (
                                <option key={st.userId} value={st.userId}>
                                  #{idx + 1} {st.nickname} ({st.positionsCount} pos · {st.tradesCount} ordres)
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      <GrPositions
                        positions={activeStudent?.positions || []}
                        trades={activeStudent?.trades || []}
                        readOnly={true}
                        emptyMessage={
                          activeStudent
                            ? `L'étudiant ${activeStudent.nickname} n'a aucune position ouverte pour le moment.`
                            : 'Aucun étudiant connecté.'
                        }
                      />
                    </div>
                    )}
                  </div>
                  <div className="gr-main-grid__side-col">
                    {/* Ordre du propriétaire-trader : il pilote la salle ET trade dedans */}
                    {!isMasterRole && (
                      <GrTradePanel
                        symbol={symbol}
                        unit={assetUnitShort(symbol)}
                        currency={currency}
                        decimals={assetDecimals(symbol)}
                        assets={room?.assets}
                        leverage={room?.leverage}
                        commissionPercent={room?.commissionPercent}
                        allowShortSelling={room?.allowShortSelling}
                        riskLimitPercent={room?.riskLimitPercent}
                        maxExposure={room?.maxExposure}
                        marketPrice={roomData.market?.price}
                        cash={portfolioData?.portfolio?.cash}
                        heldQuantity={currentHeld}
                        selectedPrice={selectedBookPrice}
                        selectedSide={selectedBookSide}
                        onSelectSymbol={handleChangeSymbol}
                        onSubmitOrder={handlePlaceOrder}
                        isSubmitting={isSubmitting}
                      />
                    )}

                    <GrOrderBook
                      book={roomData.book}
                      symbol={symbol}
                      currency={currency}
                      decimals={assetDecimals(symbol)}
                      onSelectPrice={() => {}}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Modal de création et de configuration d'une salle (Meneur de Jeu) */}
        {showCreateModal && (
          <GrCreateRoomModal
            onClose={() => setShowCreateModal(false)}
            onCreated={handleRoomCreated}
          />
        )}

        {/* Modal pour rejoindre une salle */}
        {showJoinModal && (
          <div className="gr-modal-backdrop" onClick={() => setShowJoinModal(false)}>
            <div className="gr-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Rejoindre une Game Room</h3>
              <p>Entrez le code d&apos;accès partagé par votre formateur.</p>
              <form onSubmit={handleJoinOtherRoom}>
                <div className="gr-field">
                  <label htmlFor="joinCode">Code de la salle</label>
                  <input
                    id="joinCode"
                    type="text"
                    placeholder="Ex: PANIC1"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    className="gr-input"
                    required
                  />
                </div>
                <div className="gr-field">
                  <label htmlFor="joinNick">Votre pseudo ou prénom</label>
                  <input
                    id="joinNick"
                    type="text"
                    placeholder="Ex: Alexandre"
                    value={joinNicknameInput}
                    onChange={(e) => setJoinNicknameInput(e.target.value)}
                    className="gr-input"
                  />
                </div>
                <div className="gr-modal__actions">
                  <button
                    type="button"
                    className="gr-btn gr-btn--cancel"
                    onClick={() => setShowJoinModal(false)}
                  >
                    Annuler
                  </button>
                  <button type="submit" className="gr-btn gr-btn--primary">
                    Rejoindre la salle
                  </button>
                </div>
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                  {!isMasterRole && (
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#3fd1a0',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontSize: '13px',
                        padding: '4px 8px',
                      }}
                      onClick={handleOpenLobby}
                    >
                      🏛 Voir toutes les salles de simulation disponibles
                    </button>
                  )}
                  {!isMasterRole && (
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#3fd1a0',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontSize: '13px',
                        padding: '4px 8px',
                      }}
                      onClick={() => {
                        setShowJoinModal(false);
                        setShowCreateModal(true);
                      }}
                    >
                      ➕ Créer ma salle personnelle (vous en serez le meneur de jeu)
                    </button>
                  )}
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#9aa3b6',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      fontSize: '13px',
                      padding: '4px 8px',
                    }}
                    onClick={handleResetToDemoRoom}
                  >
                    Revenir à la salle de démonstration (« Le mardi de la panique »)
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Coach IA : pour les étudiants et pour le trader-propriétaire de sa salle
            personnelle (il y participe), jamais pour le compte enseignant. */}
        {!isMasterRole && <CoachWidget sessionId={roomData?.room?.id} />}
      </div>
    </ModuleShell>
  );
}
