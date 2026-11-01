import React, { useState, useEffect } from 'react';

export default function GrTradePanel({
  marketPrice = 2700,
  cash = 100000,
  heldQuantity = 0,
  selectedPrice = null,
  selectedSide = 'buy',
  onSubmitOrder,
  isSubmitting = false,
}) {
  const [side, setSide] = useState('buy');
  const [orderType, setOrderType] = useState('market'); // 'market' | 'limit'
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('2700.00');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [showProtections, setShowProtections] = useState(false);

  useEffect(() => {
    if (selectedPrice) {
      setLimitPrice(selectedPrice.toFixed(2));
      setOrderType('limit');
    }
  }, [selectedPrice]);

  useEffect(() => {
    if (selectedSide) {
      setSide(selectedSide);
    }
  }, [selectedSide]);

  const numQty = parseFloat(quantity) || 0;
  const effectivePrice = orderType === 'limit' ? (parseFloat(limitPrice) || marketPrice) : marketPrice;
  const totalAmount = numQty * effectivePrice;

  // Calcul du maximum achetable / vendable
  const maxQty = side === 'buy' ? (cash > 0 ? cash / effectivePrice : 0) : heldQuantity;

  const handlePreset = (fraction) => {
    const calculated = (maxQty * fraction).toFixed(2);
    setQuantity(calculated);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (numQty <= 0) return;

    onSubmitOrder({
      symbol: 'XAU/USD',
      side,
      type: orderType,
      quantity: numQty,
      limitPrice: orderType === 'limit' ? parseFloat(limitPrice) : undefined,
      stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
      takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
    });
  };

  return (
    <div className="gr-trade-card">
      <div className="gr-trade-card__head">
        <span className="gr-eyebrow">PASSER UN ORDRE · GAME ROOM</span>
        <h4>Simulation Trading Virtuel</h4>
      </div>

      <form className="gr-trade-form" onSubmit={handleSubmit}>
        {/* Toggle Sens (Achat / Vente) */}
        <div className="gr-toggle-group">
          <button
            type="button"
            className={`gr-toggle-btn gr-toggle-btn--buy ${side === 'buy' ? 'is-active' : ''}`}
            onClick={() => setSide('buy')}
          >
            Acheter
          </button>
          <button
            type="button"
            className={`gr-toggle-btn gr-toggle-btn--sell ${side === 'sell' ? 'is-active' : ''}`}
            onClick={() => setSide('sell')}
          >
            Vendre
          </button>
        </div>

        {/* Toggle Type (Marché / Limite) */}
        <div className="gr-toggle-pills">
          <button
            type="button"
            className={`gr-pill-btn ${orderType === 'market' ? 'is-active' : ''}`}
            onClick={() => setOrderType('market')}
          >
            Ordre au marché
          </button>
          <button
            type="button"
            className={`gr-pill-btn ${orderType === 'limit' ? 'is-active' : ''}`}
            onClick={() => setOrderType('limit')}
          >
            Ordre limite
          </button>
        </div>

        {/* Champ Prix limite si ordre limite */}
        {orderType === 'limit' && (
          <div className="gr-field">
            <label htmlFor="grLimitPrice">Prix limite ($US)</label>
            <input
              id="grLimitPrice"
              type="number"
              step="0.01"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              className="gr-input"
              required
            />
          </div>
        )}

        {/* Champ Quantité */}
        <div className="gr-field">
          <div className="gr-field__head">
            <label htmlFor="grQuantity">Quantité (onces d’or)</label>
            <span className="gr-field__max">
              Dispo : {side === 'buy' ? `${cash.toLocaleString('fr-FR')} $` : `${heldQuantity.toFixed(2)} oz`}
            </span>
          </div>
          <input
            id="grQuantity"
            type="number"
            step="0.1"
            min="0.1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="gr-input"
            required
          />
        </div>

        {/* Boutons de pourcentage rapide */}
        <div className="gr-presets">
          <button type="button" onClick={() => handlePreset(0.25)}>25%</button>
          <button type="button" onClick={() => handlePreset(0.5)}>50%</button>
          <button type="button" onClick={() => handlePreset(0.75)}>75%</button>
          <button type="button" onClick={() => handlePreset(1.0)}>Max</button>
        </div>

        {/* Section Protection Stop-Loss & Take-Profit */}
        <div className="gr-protections-toggle">
          <button
            type="button"
            className="gr-text-btn"
            onClick={() => setShowProtections(!showProtections)}
          >
            {showProtections ? '▼ Masquer Stop-Loss / Take-Profit' : '▶ Ajouter Stop-Loss / Take-Profit'}
          </button>
        </div>

        {showProtections && (
          <div className="gr-protections-fields">
            <div className="gr-field">
              <label htmlFor="grStopLoss">Stop-Loss ($US)</label>
              <input
                id="grStopLoss"
                type="number"
                step="0.1"
                placeholder="Ex: 2650"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="gr-input"
              />
            </div>
            <div className="gr-field">
              <label htmlFor="grTakeProfit">Take-Profit ($US)</label>
              <input
                id="grTakeProfit"
                type="number"
                step="0.1"
                placeholder="Ex: 2750"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                className="gr-input"
              />
            </div>
          </div>
        )}

        {/* Récapitulatif du montant */}
        <div className="gr-summary-box">
          <div className="gr-summary-row">
            <span>Prix appliqué :</span>
            <strong>{effectivePrice.toFixed(2)} $US</strong>
          </div>
          <div className="gr-summary-row">
            <span>Total estimé :</span>
            <strong className="gr-summary-total">{totalAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $US</strong>
          </div>
        </div>

        {/* Bouton d'envoi */}
        <button
          type="submit"
          disabled={isSubmitting || numQty <= 0 || (side === 'buy' && totalAmount > cash)}
          className={`gr-submit-btn ${side === 'buy' ? 'gr-submit-btn--buy' : 'gr-submit-btn--sell'}`}
        >
          {isSubmitting
            ? 'Transmission...'
            : `${side === 'buy' ? 'Acheter' : 'Vendre'} ${numQty} oz · XAU/USD`}
        </button>
      </form>
    </div>
  );
}
