import React from 'react';

const STATUS_LABELS = {
  waiting: { text: 'En attente', class: 'gr-status--waiting' },
  running: { text: 'En cours', class: 'gr-status--running' },
  paused: { text: 'En pause', class: 'gr-status--paused' },
  finished: { text: 'Terminée', class: 'gr-status--finished' },
};

export default function GrHeader({
  room,
  market,
  participantsCount,
  onJoinCodeClick,
}) {
  const statusInfo = STATUS_LABELS[room.status] || { text: room.status, class: '' };
  const currentMin = Math.floor(room.currentMinute ?? 0);
  const totalMin = room.totalMinutes || 30;
  const progressPercent = Math.min(100, Math.round(((room.currentMinute ?? 0) / totalMin) * 100));

  const initialPrice = 2700;
  const priceChange = market?.price ? market.price - initialPrice : 0;
  const changePercent = ((priceChange / initialPrice) * 100).toFixed(2);
  const isUp = priceChange >= 0;

  return (
    <header className="gr-header">
      <div className="gr-header__main">
        <div className="gr-header__titles">
          <div className="gr-header__badges">
            <span className="gr-badge gr-badge--scenario">Scénario Pédagogique</span>
            <span className={`gr-status ${statusInfo.class}`}>
              <i className="gr-status__dot" aria-hidden="true" />
              {statusInfo.text}
            </span>
            <button
              type="button"
              className="gr-badge gr-badge--code"
              title="Code pour rejoindre cette salle (cliquer pour copier)"
              onClick={() => onJoinCodeClick?.(room.joinCode)}
            >
              Code : <strong>{room.joinCode}</strong> 📋
            </button>
          </div>
          <h2 className="gr-header__title">{room.scenarioName || 'Le mardi de la panique'}</h2>
          <p className="gr-header__subtitle">
            Salle : <span>{room.name}</span> · Réf. <code>{room.id?.slice(0, 8)}</code>
          </p>
        </div>

        <div className="gr-header__metrics">
          <div className="gr-metric gr-metric--price">
            <span className="gr-metric__label">Prix XAU/USD simulé</span>
            <div className="gr-metric__value-row">
              <strong className={`gr-price ${isUp ? 'is-up' : 'is-down'}`}>
                {market?.price ? market.price.toFixed(2) : '2 700.00'} $US
              </strong>
              <span className={`gr-change ${isUp ? 'is-up' : 'is-down'}`}>
                {isUp ? '+' : ''}{priceChange.toFixed(2)} $ ({isUp ? '+' : ''}{changePercent}%)
              </span>
            </div>
            <small className="gr-metric__sub">Spread simulé : {market?.spread?.toFixed(2) ?? '0.25'} $US</small>
          </div>

          <div className="gr-metric gr-metric--time">
            <div className="gr-time-row">
              <span className="gr-metric__label">Chronomètre séance</span>
              <strong className="gr-clock">
                Min {currentMin} / {totalMin}
              </strong>
            </div>
            <div className="gr-progress-bar" title={`Progression : ${progressPercent}%`}>
              <div
                className="gr-progress-bar__fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <small className="gr-metric__sub">
              {participantsCount} participant{participantsCount > 1 ? 's' : ''} connecté{participantsCount > 1 ? 's' : ''}
            </small>
          </div>
        </div>
      </div>
    </header>
  );
}
