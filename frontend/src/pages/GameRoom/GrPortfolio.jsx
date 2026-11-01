import React from 'react';

export default function GrPortfolio({ portfolio, currency = '$US' }) {
  const cash = portfolio?.cash ?? 100000;
  const totalValue = portfolio?.totalValue ?? 100000;
  const initialCash = portfolio?.initialCash ?? 100000;
  const positionsMarketValue = portfolio?.positionsMarketValue ?? 0;
  const realizedPnl = portfolio?.realizedPnl ?? 0;
  const unrealizedPnl = portfolio?.unrealizedPnl ?? 0;
  const returnPercent = portfolio?.returnPercent ?? 0;

  const isUp = returnPercent >= 0;

  return (
    <div className="gr-portfolio-hero">
      <div className="gr-portfolio-hero__top">
        <span className="gr-eyebrow">PORTEFEUILLE VIRTUEL · GAME ROOM</span>
        <div className="gr-portfolio-hero__badge">
          Capital initial : {initialCash.toLocaleString('fr-FR')} {currency}
        </div>
      </div>

      <div className="gr-portfolio-stats">
        <div className="gr-stat-card gr-stat-card--primary">
          <span className="gr-stat-label">Valeur totale du portefeuille</span>
          <strong className="gr-stat-value">
            {totalValue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
          </strong>
          <span className={`gr-stat-pill ${isUp ? 'is-up' : 'is-down'}`}>
            {isUp ? '+' : ''}{returnPercent.toFixed(2)} %
          </span>
        </div>

        <div className="gr-stat-card">
          <span className="gr-stat-label">Cash disponible</span>
          <strong className="gr-stat-value">
            {cash.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
          </strong>
          <small className="gr-stat-sub">Prêt pour de nouveaux ordres</small>
        </div>

        <div className="gr-stat-card">
          <span className="gr-stat-label">Valeur des positions</span>
          <strong className="gr-stat-value">
            {positionsMarketValue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
          </strong>
          <small className="gr-stat-sub">Exposition active sur les actifs de la salle</small>
        </div>

        <div className="gr-stat-card">
          <span className="gr-stat-label">P&L Non Réalisé (Latent)</span>
          <strong className={`gr-stat-value ${unrealizedPnl >= 0 ? 'is-up' : 'is-down'}`}>
            {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
          </strong>
          <small className="gr-stat-sub">Gains/pertes au prix actuel</small>
        </div>

        <div className="gr-stat-card">
          <span className="gr-stat-label">P&L Réalisé</span>
          <strong className={`gr-stat-value ${realizedPnl >= 0 ? 'is-up' : 'is-down'}`}>
            {realizedPnl >= 0 ? '+' : ''}{realizedPnl.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
          </strong>
          <small className="gr-stat-sub">Sur positions déjà clôturées</small>
        </div>
      </div>
    </div>
  );
}
