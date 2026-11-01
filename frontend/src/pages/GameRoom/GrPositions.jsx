import React from 'react';

export default function GrPositions({
  positions = [],
  trades = [],
  onClosePosition,
  isClosing = false,
  readOnly = false,
  emptyMessage = null,
}) {
  return (
    <div className="gr-positions-section">
      {/* Tableau des Positions Ouvertes */}
      <div className="gr-table-card">
        <div className="gr-table-card__head">
          <span className="gr-eyebrow">POSITIONS OUVERTES</span>
          <h4>Positions en portefeuille ({positions.length})</h4>
        </div>

        {positions.length === 0 ? (
          <div className="gr-empty-state">
            <p>
              {emptyMessage ||
                'Aucune position ouverte. Utilisez la zone de trading pour acheter ou vendre de l’or.'}
            </p>
          </div>
        ) : (
          <div className="gr-table-wrap">
            <table className="gr-table">
              <thead>
                <tr>
                  <th>Actif</th>
                  <th>Quantité</th>
                  <th>Prix d’entrée</th>
                  <th>Prix actuel</th>
                  <th>P&L Latente</th>
                  <th>Stop-Loss</th>
                  <th>Take-Profit</th>
                  {!readOnly && <th className="gr-text-right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => {
                  const isUp = pos.unrealizedPnl >= 0;
                  return (
                    <tr key={pos.id}>
                      <td><strong>{pos.symbol}</strong></td>
                      <td>{pos.quantity.toFixed(2)} oz</td>
                      <td>{pos.averagePrice.toFixed(2)} $</td>
                      <td>{pos.currentPrice.toFixed(2)} $</td>
                      <td className={isUp ? 'is-up' : 'is-down'}>
                        <strong>{isUp ? '+' : ''}{pos.unrealizedPnl.toFixed(2)} $</strong>
                      </td>
                      <td>{pos.stopLoss ? `${pos.stopLoss.toFixed(2)} $` : '—'}</td>
                      <td>{pos.takeProfit ? `${pos.takeProfit.toFixed(2)} $` : '—'}</td>
                      {!readOnly && (
                        <td className="gr-text-right">
                          <button
                            type="button"
                            className="gr-btn-danger-sm"
                            disabled={isClosing}
                            onClick={() => onClosePosition?.(pos.symbol)}
                            title="Vendre la totalité de la position au cours actuel"
                          >
                            {isClosing ? 'Clôture...' : 'Clôturer'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historique des Transactions */}
      <div className="gr-table-card gr-table-card--history">
        <div className="gr-table-card__head">
          <span className="gr-eyebrow">HISTORIQUE DES TRANSACTIONS</span>
          <h4>Derniers ordres exécutés ({trades.length})</h4>
        </div>

        {trades.length === 0 ? (
          <div className="gr-empty-state">
            <p>Aucune transaction enregistrée pour l’instant.</p>
          </div>
        ) : (
          <div className="gr-table-wrap">
            <table className="gr-table">
              <thead>
                <tr>
                  <th>Minute séance</th>
                  <th>Actif</th>
                  <th>Sens</th>
                  <th>Quantité</th>
                  <th>Prix d’exécution</th>
                  <th className="gr-text-right">Montant total</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(0, 10).map((t) => {
                  const isBuy = t.side === 'buy';
                  return (
                    <tr key={t.id}>
                      <td>Min {t.simMinute?.toFixed(1) ?? '—'}</td>
                      <td><strong>{t.symbol}</strong></td>
                      <td>
                        <span className={`gr-side-badge ${isBuy ? 'gr-side-badge--buy' : 'gr-side-badge--sell'}`}>
                          {isBuy ? 'ACHAT' : 'VENTE'}
                        </span>
                      </td>
                      <td>{t.quantity.toFixed(2)} oz</td>
                      <td>{t.price.toFixed(2)} $</td>
                      <td className="gr-text-right">
                        {t.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $US
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
