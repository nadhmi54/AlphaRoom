
import { formatPrice } from '../../data/roomAssets.js';

const STATUS_LABELS = {
  waiting: { text: 'En attente', class: 'gr-status--waiting' },
  running: { text: 'En cours', class: 'gr-status--running' },
  paused: { text: 'En pause', class: 'gr-status--paused' },
  finished: { text: 'Terminée', class: 'gr-status--finished' },
};

function formatClock(dateIso) {
  if (!dateIso) return null;
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function GrHeader({
  room,
  market,
  participantsCount,
  currency = '$US',
  sourceLabel = 'Scénario pédagogique',
  onJoinCodeClick,
}) {
  const statusInfo = STATUS_LABELS[room.status] || { text: room.status, class: '' };
  const symbol = market?.symbol || room?.activeSymbol || room?.assets?.[0] || '—';
  const currentMin = Math.floor(room.currentMinute ?? 0);
  const totalMin = room.totalMinutes || 30;
  const progressPercent = room.progressPercent ?? Math.min(100, Math.round(((room.currentMinute ?? 0) / totalMin) * 100));

  // Prix de référence = premier point de la série diffusée par le serveur :
  // tous les participants voient la même variation, calculée côté backend.
  const referencePrice = market?.series?.[0]?.price ?? market?.price ?? 0;
  const price = market?.price ?? referencePrice;
  const priceChange = referencePrice ? price - referencePrice : 0;
  const changePercent = referencePrice ? ((priceChange / referencePrice) * 100).toFixed(2) : '0.00';
  const isUp = priceChange >= 0;

  const historyStart = formatClock(room.historyStartAt);
  const historyEnd = formatClock(room.historyEndAt);

  return (
    <header className="gr-header">
      <div className="gr-header__main">
        <div className="gr-header__titles">
          <div className="gr-header__badges">
            <span className="gr-badge gr-badge--scenario">{sourceLabel}</span>
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
          <h2 className="gr-header__title">{room.scenarioName || room.name}</h2>
          <p className="gr-header__subtitle">
            Salle : <span>{room.name}</span> · Réf. <code>{room.id?.slice(0, 8)}</code>
            {room.description ? ` · ${room.description}` : ''}
          </p>
        </div>

        <div className="gr-header__metrics">
          <div className="gr-metric gr-metric--price">
            <span className="gr-metric__label">Prix {symbol}</span>
            <div className="gr-metric__value-row">
              <strong className={`gr-price ${isUp ? 'is-up' : 'is-down'}`}>
                {formatPrice(price, symbol)} {currency}
              </strong>
              <span className={`gr-change ${isUp ? 'is-up' : 'is-down'}`}>
                {isUp ? '+' : ''}{priceChange.toFixed(2)} ({isUp ? '+' : ''}{changePercent}%)
              </span>
            </div>
            <small className="gr-metric__sub">
              Spread : {market?.spread != null ? formatPrice(market.spread, symbol) : '—'} {currency}
              {market?.source ? ` · Flux ${market.source}` : ''}
            </small>
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
              {room.playbackSpeed ? ` · Relecture x${room.playbackSpeed}` : ''}
              {room.timeframe ? ` · Bougies ${room.timeframe}` : ''}
            </small>
            {(historyStart || historyEnd) && (
              <small className="gr-metric__sub gr-metric__sub--history">
                Fenêtre rejouée : {historyStart || '—'} → {historyEnd || '—'}
              </small>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
