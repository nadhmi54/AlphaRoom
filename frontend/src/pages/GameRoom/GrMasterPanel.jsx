import { useEffect, useState } from 'react';

const SPEED_PRESETS = [0.5, 1, 2, 5, 12, 30];

export default function GrMasterPanel({
  room,
  dashboard,
  currency = '$US',
  symbol = 'XAU/USD',
  onControlRoom,
  onTriggerAction,
  onSetSpeed,
  onSeek,
  selectedStudentId,
  onSelectStudent,
}) {
  const [selectedMinute, setSelectedMinute] = useState('0');
  const [customNews, setCustomNews] = useState('');
  const [speedInput, setSpeedInput] = useState(String(room?.playbackSpeed ?? 1));
  const [seekSeconds, setSeekSeconds] = useState(room?.simElapsedSeconds ?? 0);
  const [seekDirty, setSeekDirty] = useState(false);

  const status = room?.status || 'waiting';
  const totalSeconds = room?.totalSimSeconds || 1800;

  // Le curseur suit la séance, sauf pendant que l'enseignant le déplace.
  useEffect(() => {
    if (seekDirty) return;
    setSeekSeconds(room?.simElapsedSeconds ?? 0);
  }, [room?.simElapsedSeconds, seekDirty]);

  const handleNewsSubmit = (e) => {
    e.preventDefault();
    if (!customNews.trim()) return;
    onTriggerAction({
      type: 'NEWS',
      title: 'COMMUNIQUÉ FLASH',
      description: customNews,
      payload: { custom: true },
    });
    setCustomNews('');
  };

  const applySpeed = (value) => {
    const speed = Number(value);
    if (!Number.isFinite(speed) || speed <= 0) return;
    setSpeedInput(String(speed));
    onSetSpeed?.(speed);
  };

  return (
    <div className="gr-master-panel">
      <div className="gr-master-panel__header">
        <div>
          <span className="gr-eyebrow">CONTRÔLE PÉDAGOGIQUE · ENSEIGNANT</span>
          <h3>Panneau du Meneur de Jeu (Game Master)</h3>
        </div>
        <div className="gr-master-panel__actions-row">
          {status === 'waiting' && (
            <button
              type="button"
              className="gr-btn gr-btn--start"
              onClick={() => onControlRoom('start')}
            >
              ▶ Démarrer la séance
            </button>
          )}
          {status === 'running' && (
            <button
              type="button"
              className="gr-btn gr-btn--pause"
              onClick={() => onControlRoom('pause')}
            >
              ⏸ Mettre en pause
            </button>
          )}
          {status === 'paused' && (
            <button
              type="button"
              className="gr-btn gr-btn--resume"
              onClick={() => onControlRoom('resume')}
            >
              ▶ Reprendre le cours
            </button>
          )}
          <button
            type="button"
            className="gr-btn gr-btn--reset"
            onClick={() => onControlRoom('reset')}
          >
            ↺ Réinitialiser la salle
          </button>
          {status !== 'finished' && (
            <button
              type="button"
              className="gr-btn gr-btn--finish"
              onClick={() => onControlRoom('finish')}
            >
              ⏹ Terminer la séance
            </button>
          )}
        </div>
      </div>

      {/* Configuration appliquée à la salle */}
      <div className="gr-config-summary">
        <span className="gr-eyebrow">CONFIGURATION DE LA SALLE</span>
        <ul>
          <li><span>Actifs</span><strong>{(room?.assets || []).join(', ') || symbol}</strong></li>
          <li><span>Capital initial</span><strong>{Number(room?.initialCapital ?? 0).toLocaleString('fr-FR')} {currency}</strong></li>
          <li><span>Levier</span><strong>x{room?.leverage ?? 1}</strong></li>
          <li><span>Commission</span><strong>{room?.commissionPercent ?? 0} %</strong></li>
          <li><span>Spread</span><strong>x{room?.spreadMultiplier ?? 1}</strong></li>
          <li><span>Vente à découvert</span><strong>{room?.allowShortSelling ? 'Autorisée' : 'Interdite'}</strong></li>
          <li>
            <span>Exposition max.</span>
            <strong>{room?.maxExposure ? `${Number(room.maxExposure).toLocaleString('fr-FR')} ${currency}` : 'Illimitée'}</strong>
          </li>
          <li>
            <span>Risque max. / position</span>
            <strong>{room?.riskLimitPercent ? `${room.riskLimitPercent} %` : 'Aucune limite'}</strong>
          </li>
        </ul>
      </div>

      {/* Contrôle du temps : vitesse de relecture et curseur de séance */}
      <div className="gr-time-controls">
        <div className="gr-time-controls__col">
          <span className="gr-eyebrow">VITESSE DE RELECTURE</span>
          <div className="gr-speed-presets">
            {SPEED_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`gr-btn-pill ${Number(room?.playbackSpeed) === preset ? 'is-active' : ''}`}
                onClick={() => applySpeed(preset)}
                disabled={room?.sourceMode === 'live'}
              >
                x{preset}
              </button>
            ))}
          </div>
          <div className="gr-speed-custom">
            <label htmlFor="grSpeed">Vitesse personnalisée</label>
            <input
              id="grSpeed"
              type="number"
              min="0.1"
              max="1000"
              step="0.1"
              className="gr-input gr-input--sm"
              value={speedInput}
              disabled={room?.sourceMode === 'live'}
              onChange={(e) => setSpeedInput(e.target.value)}
            />
            <button
              type="button"
              className="gr-btn gr-btn--sm"
              disabled={room?.sourceMode === 'live'}
              onClick={() => applySpeed(speedInput)}
            >
              Appliquer
            </button>
          </div>
          <small className="gr-master-note">
            {room?.sourceMode === 'live'
              ? 'En marché live la vitesse est fixée à 1x : les cotations réelles défilent en temps réel.'
              : `Actuellement x${room?.playbackSpeed ?? 1} — ${(room?.durationMinutes ?? 30)} min réelles pour ${Math.round(totalSeconds / 60)} min de marché.`}
          </small>
        </div>

        <div className="gr-time-controls__col">
          <span className="gr-eyebrow">CURSEUR DE SÉANCE (TIMELINE)</span>
          <input
            id="grTimeline"
            type="range"
            min="0"
            max={totalSeconds}
            step="1"
            className="gr-timeline"
            value={Math.min(seekSeconds, totalSeconds)}
            onChange={(e) => {
              setSeekSeconds(Number(e.target.value));
              setSeekDirty(true);
            }}
          />
          <div className="gr-timeline__labels">
            <span>Min 0</span>
            <strong>
              Min {(seekSeconds / 60).toFixed(1)} / {room?.totalMinutes ?? Math.round(totalSeconds / 60)}
            </strong>
            <span>Min {room?.totalMinutes ?? Math.round(totalSeconds / 60)}</span>
          </div>
          <div className="gr-timeline__actions">
            <button
              type="button"
              className="gr-btn gr-btn--sm"
              onClick={() => {
                setSeekSeconds(0);
                setSeekDirty(false);
                onSeek?.(0);
              }}
            >
              ⏮ Revenir au début
            </button>
            <button
              type="button"
              className="gr-btn gr-btn--sm gr-btn--primary"
              onClick={() => {
                setSeekDirty(false);
                onSeek?.(seekSeconds);
              }}
            >
              Aller à Min {(seekSeconds / 60).toFixed(1)}
            </button>
          </div>
          <small className="gr-master-note">
            Le curseur déplace la séance pour tous les participants : prix, bougies et chronomètre
            sont recalculés côté serveur à partir de la seconde choisie.
          </small>
        </div>
      </div>

      <div className="gr-master-grid">
        {/* Déclenchement d'événements et de chocs */}
        <div className="gr-master-box">
          <h4>Déclencher des chocs de marché</h4>
          <p className="gr-master-desc">
            Injecte des variations instantanées dans le moteur de simulation partagé par tous les étudiants.
          </p>

          <div className="gr-shocks-grid">
            <button
              type="button"
              className="gr-shock-btn gr-shock-btn--price"
              onClick={() =>
                onTriggerAction({
                  type: 'PRICE_SHOCK',
                  title: 'CHOC DE PRIX BAISSIER (-3%)',
                  description: 'Chute brutale de -3% du cours de l’or simulant des ventes massives.',
                  payload: { percent: 3 },
                })
              }
            >
              ⚡ Choc de Prix (-3%)
            </button>

            <button
              type="button"
              className="gr-shock-btn gr-shock-btn--spread"
              onClick={() =>
                onTriggerAction({
                  type: 'SPREAD_SHOCK',
                  title: 'ÉLARGISSEMENT DU SPREAD',
                  description: 'Multiplication du spread par 4 pour pénaliser les ordres au marché.',
                  payload: { multiplier: 4.0 },
                })
              }
            >
              ↔ Choc de Spread (x4)
            </button>

            <button
              type="button"
              className="gr-shock-btn gr-shock-btn--liquidity"
              onClick={() =>
                onTriggerAction({
                  type: 'LIQUIDITY_SHOCK',
                  title: 'CHOC DE LIQUIDITÉ',
                  description: 'Division par 4 de la profondeur du carnet, créant un slippage élevé.',
                  payload: { factor: 0.25 },
                })
              }
            >
              💧 Choc de Liquidité (-75%)
            </button>

            <button
              type="button"
              className="gr-shock-btn gr-shock-btn--whale"
              onClick={() =>
                onTriggerAction({
                  type: 'WHALE',
                  title: 'GROS ORDRE INSTITUTIONNEL (WHALE)',
                  description: 'Injection d’un ordre de 500 onces à la vente dans le carnet.',
                  payload: { quantity: 500 },
                })
              }
            >
              🐋 Ordre Whale (Vente 500 oz)
            </button>
          </div>

          {/* Formulaire de publication d'actualité fictive */}
          <form className="gr-news-form" onSubmit={handleNewsSubmit}>
            <input
              type="text"
              placeholder="Diffuser une actualité fictive aux étudiants (ex: Annonce Fed)..."
              value={customNews}
              onChange={(e) => setCustomNews(e.target.value)}
              className="gr-input"
            />
            <button type="submit" className="gr-btn gr-btn--news">
              Diffuser News 📢
            </button>
          </form>
        </div>

        {/* Retour en arrière (Rollback & Replay) */}
        <div className="gr-master-box gr-master-box--rollback">
          <h4>Retour en arrière (Rollback & Replay)</h4>
          <p className="gr-master-desc">
            Restaure l&apos;état exact du marché et des portefeuilles à une minute antérieure pour rejouer une séquence pédagogique.
          </p>

          <div className="gr-rollback-action">
            <label htmlFor="grRollbackMin">Revenir à la minute :</label>
            <div className="gr-rollback-input-row">
              <div className="gr-rollback-field">
                <input
                  id="grRollbackMin"
                  type="number"
                  min="0"
                  max={Math.floor(room?.totalMinutes || 30)}
                  step="1"
                  value={selectedMinute}
                  onChange={(e) => setSelectedMinute(e.target.value)}
                  className="gr-input gr-input--rollback"
                  placeholder="Ex: 5"
                />
                <span className="gr-rollback-unit">min</span>
              </div>

              <button
                type="button"
                className="gr-btn gr-btn--rollback"
                disabled={selectedMinute === '' || Number(selectedMinute) < 0}
                onClick={() =>
                  onTriggerAction({
                    type: 'ROLLBACK',
                    title: `ROLLBACK À LA MINUTE ${selectedMinute}`,
                    description: `Restauration de la simulation à la minute ${selectedMinute}.`,
                    payload: { targetMinute: parseFloat(selectedMinute) || 0 },
                  })
                }
              >
                ⏪ Effectuer le Rollback (Min {selectedMinute || 0})
              </button>
            </div>

            {/* Points de déclenchement enregistrés (Chocs de marché) */}
            <div className="gr-rollback-saved-section">
              <span className="gr-rollback-saved-label">
                Points de restauration enregistrés ({dashboard?.triggerPoints?.length || 0}) :
              </span>

              {(!dashboard?.triggerPoints || dashboard.triggerPoints.length === 0) ? (
                <small className="gr-no-triggers">
                  Aucun choc déclenché pour l&apos;instant. Chaque choc injecté s&apos;enregistre ici pour permettre d&apos;y revenir.
                </small>
              ) : (
                <div className="gr-triggers-list">
                  {dashboard.triggerPoints.map((trig) => {
                    const isSelected = selectedMinute === String(trig.minute);
                    return (
                      <button
                        key={trig.id}
                        type="button"
                        className={`gr-trigger-pill ${isSelected ? 'is-active' : ''}`}
                        onClick={() => setSelectedMinute(String(trig.minute))}
                        title={`Déclenché à la minute ${trig.minute} : ${trig.title}`}
                      >
                        <span className="gr-trigger-pill__badge">Min {trig.minute}</span>
                        <span className="gr-trigger-pill__title">{trig.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="gr-rollback-presets">
              <button
                type="button"
                className="gr-btn-pill"
                onClick={() => setSelectedMinute('0')}
              >
                Minute 0 (Départ)
              </button>
              <button
                type="button"
                className="gr-btn-pill"
                onClick={() => {
                  const cur = Math.floor(room?.currentMinute || 0);
                  setSelectedMinute(String(Math.max(0, cur - 1)));
                }}
              >
                -1 min
              </button>
              <button
                type="button"
                className="gr-btn-pill"
                onClick={() => {
                  const cur = Math.floor(room?.currentMinute || 0);
                  setSelectedMinute(String(Math.max(0, cur - 5)));
                }}
              >
                -5 min
              </button>
              <button
                type="button"
                className="gr-btn-pill"
                onClick={() => {
                  const cur = Math.floor(room?.currentMinute || 0);
                  setSelectedMinute(String(Math.max(0, cur - 10)));
                }}
              >
                -10 min
              </button>
            </div>
          </div>

          <small className="gr-master-note">
            Le rollback purge les ordres et transactions postérieurs et recalcule le cash de chaque étudiant à cet instant précis.
          </small>
        </div>
      </div>

      {/* Leaderboard des participants connectés */}
      {dashboard?.leaderboard && (
        <div className="gr-master-leaderboard">
          <div className="gr-leaderboard-header">
            <h4>Tableau de bord des participants ({dashboard.leaderboard.length})</h4>
            <span className="gr-leaderboard-tip">
              💡 Cliquez sur un étudiant pour charger ses positions et son historique ci-dessous
            </span>
          </div>
          <div className="gr-table-wrap">
            <table className="gr-table gr-table--selectable">
              <thead>
                <tr>
                  <th>Rang</th>
                  <th>Étudiant</th>
                  <th>Valeur portefeuille</th>
                  <th>Rendement</th>
                  <th>P&L Latente</th>
                  <th>P&L Réalisée</th>
                  <th>Positions</th>
                  <th>Nb Trades</th>
                  <th className="gr-text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.leaderboard.map((item, idx) => {
                  const isSelected = item.userId === selectedStudentId;
                  return (
                    <tr
                      key={item.participantId}
                      className={`gr-leaderboard-row ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => onSelectStudent?.(item.userId)}
                      title="Cliquer pour afficher les positions et transactions de cet étudiant"
                    >
                      <td><strong>#{idx + 1}</strong></td>
                      <td>
                        <strong>{item.nickname}</strong>
                        {isSelected && <span className="gr-selected-tag">👁️ Actif</span>}
                      </td>
                      <td><strong>{item.totalValue.toLocaleString('fr-FR')} {currency}</strong></td>
                      <td className={item.returnPercent >= 0 ? 'is-up' : 'is-down'}>
                        {item.returnPercent >= 0 ? '+' : ''}{item.returnPercent.toFixed(2)} %
                      </td>
                      <td className={item.unrealizedPnl >= 0 ? 'is-up' : 'is-down'}>
                        {item.unrealizedPnl >= 0 ? '+' : ''}{item.unrealizedPnl.toFixed(2)} {currency}
                      </td>
                      <td className={item.realizedPnl >= 0 ? 'is-up' : 'is-down'}>
                        {item.realizedPnl >= 0 ? '+' : ''}{item.realizedPnl.toFixed(2)} {currency}
                      </td>
                      <td>{item.positionsCount}</td>
                      <td>{item.tradesCount}</td>
                      <td className="gr-text-right">
                        <button
                          type="button"
                          className={`gr-btn-inspect-sm ${isSelected ? 'is-active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectStudent?.(item.userId);
                          }}
                        >
                          {isSelected ? 'Observé 👁️' : 'Inspecter'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
