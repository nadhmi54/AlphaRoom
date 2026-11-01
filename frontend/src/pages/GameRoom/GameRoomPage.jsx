import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import ModuleShell from '../../components/ModuleShell/ModuleShell.jsx';
import { useAuth } from '../../context/useAuth.js';
import GrHeader from './GrHeader.jsx';
import GrPortfolio from './GrPortfolio.jsx';
import GrChart from './GrChart.jsx';
import GrOrderBook from './GrOrderBook.jsx';
import GrTradePanel from './GrTradePanel.jsx';
import GrPositions from './GrPositions.jsx';
import GrMasterPanel from './GrMasterPanel.jsx';
import {
  getDemoRoom,
  getGameRoomDetails,
  getGameRoomPortfolio,
  placeSimOrder,
  closeSimPosition,
  controlGameRoom,
  triggerGameMasterAction,
  getGameRoomDashboard,
  joinGameRoom,
} from '../../services/gameRoomService.js';
import './GameRoomPage.css';

const SYNC_INTERVAL_MS = 2500;

export default function GameRoomPage() {
  const { profile } = useAuth();
  const [roomData, setRoomData] = useState(null);
  const [portfolioData, setPortfolioData] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  const activeRoomIdRef = useRef(null);
  const previousEventsCountRef = useRef(0);

  // Vérification stricte du rôle : Seuls 'game_master' ou 'admin' peuvent voir le panneau enseignant.
  // Un utilisateur étudiant / trader ne verra JAMAIS le panneau enseignant ni le tableau des participants.
  const isMaster = Boolean(
    (profile?.role === 'game_master' || profile?.role === 'admin') &&
    roomData?.room?.isMaster
  );

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  // Chargement initial (salle démo)
  const initRoom = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const initial = await getDemoRoom();
      setRoomData(initial);
      activeRoomIdRef.current = initial.room.id;

      const userIsMaster =
        (profile?.role === 'game_master' || profile?.role === 'admin') &&
        Boolean(initial.room?.isMaster);

      const [pf, dash] = await Promise.all([
        getGameRoomPortfolio(initial.room.id),
        userIsMaster ? getGameRoomDashboard(initial.room.id) : Promise.resolve(null),
      ]);
      setPortfolioData(pf);
      if (dash) setDashboardData(dash);
    } catch (err) {
      setError(err.message || 'Impossible de charger la salle de simulation.');
    } finally {
      setLoading(false);
    }
  }, [profile?.role]);

  useEffect(() => {
    initRoom();
  }, [initRoom]);

  // Synchronisation continue du marché et détection des événements diffusés
  const syncRoom = useCallback(async () => {
    const roomId = activeRoomIdRef.current;
    if (!roomId) return;
    try {
      const userIsMaster =
        (profile?.role === 'game_master' || profile?.role === 'admin') &&
        Boolean(roomData?.room?.isMaster);

      const [updatedDetails, updatedPf] = await Promise.all([
        getGameRoomDetails(roomId),
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
  }, [profile?.role, roomData?.room?.isMaster]);

  useEffect(() => {
    const timer = setInterval(() => {
      syncRoom();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [syncRoom]);

  // Passage d'un ordre simulé (Étudiant)
  const handlePlaceOrder = async (orderPayload) => {
    if (!roomData?.room?.id) return;
    setIsSubmitting(true);
    try {
      const res = await placeSimOrder(roomData.room.id, orderPayload);
      const actionWord = orderPayload.side === 'buy' ? 'Acheté' : 'Vendu';
      showToast(
        `${actionWord} ${orderPayload.quantity} oz · XAU/USD à ${res.executedPrice || orderPayload.limitPrice} $US`,
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
        reset: 'Salle réinitialisée au départ (Minute 0, 100 000 $).',
      };
      showToast(labels[action] || 'Action exécutée.', 'success');
      await syncRoom();
    } catch (err) {
      showToast(err.message || 'Erreur d’action', 'error');
    }
  };

  // Actions Game Master (Chocs, News, Rollback) - Réservé au Meneur de jeu
  const handleTriggerAction = async (actionPayload) => {
    if (!roomData?.room?.id) return;
    try {
      await triggerGameMasterAction(roomData.room.id, actionPayload);
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
      activeRoomIdRef.current = res.room.id;
      setShowJoinModal(false);
      setJoinCodeInput('');
      setJoinNicknameInput('');
      showToast(`Connecté à la salle : ${res.room.name}`, 'success');
      await syncRoom();
    } catch (err) {
      showToast(err.message || 'Salle introuvable avec ce code', 'error');
    } finally {
      setLoading(false);
    }
  };

  const currentHeld = portfolioData?.positions?.find((p) => p.symbol === 'XAU/USD')?.quantity || 0;
  const avgBuy = portfolioData?.positions?.find((p) => p.symbol === 'XAU/USD')?.averagePrice || null;

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

        {/* BARRE D'INDICATEUR DE STATUT */}
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
            <button
              type="button"
              className="gr-btn gr-btn--join"
              onClick={() => setShowJoinModal(true)}
            >
              Rejoindre une autre salle 🔑
            </button>
          </div>
        </div>

        {roomData && (
          <>
            {/* EN-TÊTE COMMUN DE LA SALLE */}
            <GrHeader
              room={roomData.room}
              market={roomData.market}
              participantsCount={roomData.participantsCount}
              onJoinCodeClick={(code) => {
                navigator.clipboard?.writeText(code);
                showToast(`Code ${code} copié dans le presse-papier !`);
              }}
            />

            {/* =========================================================================
                VUE 1 : INTERFACE ÉTUDIANT (Trader / Client normal)
                L'étudiant ne voit que son propre portefeuille, son graphique, son carnet,
                sa zone de trading et son coach IA.
               ========================================================================= */}
            {!isMaster && (
              <div className="gr-student-view">
                {/* Son Portefeuille Virtuel Indépendant (100k$) */}
                <GrPortfolio portfolio={portfolioData?.portfolio} />

                {/* Scène de Marché : Graphique + Carnet + Trading */}
                <div className="gr-main-grid">
                  <div className="gr-main-grid__chart-col">
                    <GrChart
                      series={roomData.market?.series}
                      averageBuyPrice={avgBuy}
                      currentPrice={roomData.market?.price}
                      events={roomData.recentEvents}
                    />

                    {/* Tableau des positions personnelles de l'étudiant */}
                    <GrPositions
                      positions={portfolioData?.positions}
                      trades={portfolioData?.trades}
                      onClosePosition={handleClosePosition}
                      isClosing={isClosing}
                    />
                  </div>

                  <div className="gr-main-grid__side-col">
                    {/* Zone de Trading Étudiant */}
                    <GrTradePanel
                      marketPrice={roomData.market?.price}
                      cash={portfolioData?.portfolio?.cash}
                      heldQuantity={currentHeld}
                      selectedPrice={selectedBookPrice}
                      selectedSide={selectedBookSide}
                      onSubmitOrder={handlePlaceOrder}
                      isSubmitting={isSubmitting}
                    />

                    {/* Carnet d'ordres simulé */}
                    <GrOrderBook
                      book={roomData.book}
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
                {/* Panneau de contrôle exclusif du Formateur avec Leaderboard */}
                <GrMasterPanel
                  room={roomData.room}
                  dashboard={dashboardData}
                  onControlRoom={handleControlRoom}
                  onTriggerAction={handleTriggerAction}
                  selectedStudentId={activeStudent?.userId}
                  onSelectStudent={(id) => setSelectedStudentId(id)}
                />

                {/* Graphique et Carnet pour surveiller les mouvements de marché de la classe */}
                <div className="gr-main-grid gr-main-grid--master">
                  <div className="gr-main-grid__chart-col">
                    <GrChart
                      series={roomData.market?.series}
                      currentPrice={roomData.market?.price}
                      events={roomData.recentEvents}
                    />

                    {/* SUPERVISION INDIVIDUELLE : Positions et Historique de chaque étudiant pour le Meneur de Jeu */}
                    <div className="gr-master-student-details">
                      <div className="gr-inspector-bar">
                        <div className="gr-inspector-bar__info">
                          <span className="gr-eyebrow">SUPERVISION INDIVIDUELLE · ÉTUDIANT TRADER</span>
                          <h4>
                            {activeStudent
                              ? `Positions & Ordres de : ${activeStudent.nickname} (${activeStudent.totalValue.toLocaleString('fr-FR')} $US)`
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
                  </div>
                  <div className="gr-main-grid__side-col">
                    <GrOrderBook
                      book={roomData.book}
                      onSelectPrice={() => {}}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Modal pour rejoindre une salle */}
        {showJoinModal && (
          <div className="gr-modal-backdrop" onClick={() => setShowJoinModal(false)}>
            <div className="gr-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Rejoindre une Game Room</h3>
              <p>Entrez le code d'accès partagé par votre formateur.</p>
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
              </form>
            </div>
          </div>
        )}
      </div>
    </ModuleShell>
  );
}
