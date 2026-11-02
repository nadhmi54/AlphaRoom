import { useState, useEffect, useRef } from 'react';
import { assetQtyDecimals, formatPrice } from '../../data/roomAssets.js';

export default function GrTradePanel({
  symbol = 'XAU/USD',
  assets = null,
  unit = 'once troy (oz)',
  currency = '$US',
  decimals = 2,
  leverage = 1,
  commissionPercent = 0,
  allowShortSelling = false,
  riskLimitPercent = null,
  maxExposure = null,
  marketPrice = 0,
  cash = 0,
  heldQuantity = 0,
  selectedPrice = null,
  selectedSide = 'buy',
  onSelectSymbol,
  onSubmitOrder,
  isSubmitting = false,
}) {
  const [side, setSide] = useState('buy');
  const [orderType, setOrderType] = useState('market'); // 'market' | 'limit'
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState(() =>
    marketPrice ? marketPrice.toFixed(decimals) : '',
  );
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [showProtections, setShowProtections] = useState(false);

  const effectiveLeverage = Number(leverage) > 0 ? Number(leverage) : 1;
  const qtyDecimals = assetQtyDecimals(symbol);

  useEffect(() => {
    if (selectedPrice) {
      setLimitPrice(selectedPrice.toFixed(decimals));
      setOrderType('limit');
    }
  }, [selectedPrice, decimals]);

  useEffect(() => {
    if (selectedSide) {
      setSide(selectedSide);
    }
  }, [selectedSide]);

  // Changement d'actif : on réaligne le prix limite et on vide les protections,
  // sans écraser la saisie de l'étudiant à chaque rafraîchissement de prix.
  const lastSymbolRef = useRef(symbol);
  useEffect(() => {
    if (lastSymbolRef.current === symbol) return;
    lastSymbolRef.current = symbol;
    setLimitPrice(marketPrice ? marketPrice.toFixed(decimals) : '');
    setStopLoss('');
    setTakeProfit('');
  }, [symbol, marketPrice, decimals]);

  // Un risque imposé rend le Stop-Loss obligatoire : on l'ouvre par défaut.
  useEffect(() => {
    if (riskLimitPercent) setShowProtections(true);
  }, [riskLimitPercent]);

  const numQty = parseFloat(quantity) || 0;
  const effectivePrice = orderType === 'limit' ? (parseFloat(limitPrice) || marketPrice) : marketPrice;
  const notional = numQty * effectivePrice;
  const commission = (notional * (Number(commissionPercent) || 0)) / 100;
  const marginRequired = notional / effectiveLeverage + commission;

  const buyingPower = Math.max(0, cash) * effectiveLeverage;
  const maxQty =
    side === 'buy'
      ? (effectivePrice > 0 ? buyingPower / effectivePrice : 0)
      : allowShortSelling
        ? (effectivePrice > 0 ? buyingPower / effectivePrice : 0)
        : Math.max(0, heldQuantity);

  const handlePreset = (fraction) => {
    setQuantity((maxQty * fraction).toFixed(qtyDecimals));
  };

  const stopLossMissing = Boolean(riskLimitPercent) && side === 'buy' && !stopLoss;
  const insufficientFunds = side === 'buy' && marginRequired > cash + 0.0001;
  const nothingToSell = side === 'sell' && !allowShortSelling && numQty > Math.max(0, heldQuantity);
  const canSubmit = numQty > 0 && effectivePrice > 0 && !stopLossMissing && !insufficientFunds && !nothingToSell;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    onSubmitOrder({
      symbol,
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
        {assets && assets.length > 1 && (
          <div className="gr-field">
            <label htmlFor="grAsset">Actif</label>
            <select
              id="grAsset"
              className="gr-input"
              value={symbol}
              onChange={(e) => onSelectSymbol?.(e.target.value)}
            >
              {assets.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        )}

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
            title={allowShortSelling ? 'Vente à découvert autorisée sur cette salle' : 'Vente limitée aux quantités détenues'}
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
            <label htmlFor="grLimitPrice">Prix limite ({currency})</label>
            <input
              id="grLimitPrice"
              type="number"
              step={10 ** -decimals}
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
            <label htmlFor="grQuantity">Quantité ({unit})</label>
            <span className="gr-field__max">
              Dispo : {side === 'buy'
                ? `${Math.max(0, cash).toLocaleString('fr-FR')} ${currency}`
                : `${Math.max(0, heldQuantity).toFixed(qtyDecimals)} ${unit}`}
            </span>
          </div>
          <input
            id="grQuantity"
            type="number"
            step={10 ** -qtyDecimals}
            min={10 ** -qtyDecimals}
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
          {riskLimitPercent && (
            <span className="gr-rule-badge">
              Risque imposé : {riskLimitPercent} % max · Stop-Loss obligatoire
            </span>
          )}
        </div>

        {showProtections && (
          <div className="gr-protections-fields">
            <div className="gr-field">
              <label htmlFor="grStopLoss">Stop-Loss ({currency}) {riskLimitPercent ? '*' : ''}</label>
              <input
                id="grStopLoss"
                type="number"
                step={10 ** -decimals}
                placeholder={side === 'buy' ? 'Sous votre prix d’entrée' : 'Au-dessus de votre prix d’entrée'}
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="gr-input"
                required={Boolean(riskLimitPercent)}
              />
            </div>
            <div className="gr-field">
              <label htmlFor="grTakeProfit">Take-Profit ({currency})</label>
              <input
                id="grTakeProfit"
                type="number"
                step={10 ** -decimals}
                placeholder="Ex : objectif de gain"
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
            <strong>{formatPrice(effectivePrice, symbol)} {currency}</strong>
          </div>
          <div className="gr-summary-row">
            <span>Montant nominal :</span>
            <strong>{notional.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</strong>
          </div>
          {effectiveLeverage > 1 && (
            <div className="gr-summary-row">
              <span>Marge immobilisée (levier x{effectiveLeverage}) :</span>
              <strong>{(notional / effectiveLeverage).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</strong>
            </div>
          )}
          {Number(commissionPercent) > 0 && (
            <div className="gr-summary-row">
              <span>Commission ({commissionPercent} %) :</span>
              <strong>{commission.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</strong>
            </div>
          )}
          <div className="gr-summary-row">
            <span>Total estimé :</span>
            <strong className="gr-summary-total">
              {(effectiveLeverage > 1 || Number(commissionPercent) > 0 ? marginRequired : notional)
                .toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
            </strong>
          </div>
          {maxExposure && (
            <small className="gr-summary-note">
              Exposition maximale autorisée par la salle : {Number(maxExposure).toLocaleString('fr-FR')} {currency}
            </small>
          )}
        </div>

        {insufficientFunds && (
          <p className="gr-field-error">
            Cash insuffisant : cet ordre exige {marginRequired.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} {currency} de marge.
          </p>
        )}
        {nothingToSell && (
          <p className="gr-field-error">
            Quantité supérieure à votre position ({Math.max(0, heldQuantity).toFixed(qtyDecimals)} {unit}).
            La vente à découvert est désactivée sur cette salle.
          </p>
        )}
        {stopLossMissing && (
          <p className="gr-field-error">
            Le Meneur de Jeu impose un Stop-Loss : renseignez-le avant d’acheter.
          </p>
        )}

        {/* Bouton d'envoi */}
        <button
          type="submit"
          disabled={isSubmitting || !canSubmit}
          className={`gr-submit-btn ${side === 'buy' ? 'gr-submit-btn--buy' : 'gr-submit-btn--sell'}`}
        >
          {isSubmitting
            ? 'Transmission...'
            : `${side === 'buy' ? 'Acheter' : 'Vendre'} ${numQty} ${unit} · ${symbol}`}
        </button>
      </form>
    </div>
  );
}
