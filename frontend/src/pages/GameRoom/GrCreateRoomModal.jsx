import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DURATION_CHOICES,
  HISTORY_RANGE_CHOICES,
  SOURCE_MODES,
  TIMEFRAME_CHOICES,
  findRoomAsset,
} from '../../data/roomAssets.js';
import { createGameRoom, previewCsv } from '../../services/gameRoomService.js';
import GrAssetPicker from './GrAssetPicker.jsx';

const STEPS = [
  { id: 1, label: 'Salle' },
  { id: 2, label: 'Source de marché' },
  { id: 3, label: 'Temps' },
  { id: 4, label: 'Risque & frais' },
];

const HISTORY_RANGE_SECONDS = { '5m': 300, '1h': 3600, '24h': 86400 };

function num(value, fallback = undefined) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function GrCreateRoomModal({ onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Le bouton final apparaît à la place exacte de « Continuer » : un double-clic
  // impatient sur « Continuer » créait la salle sans lire le récapitulatif.
  const [submitReady, setSubmitReady] = useState(false);
  const armTimerRef = useRef(null);

  const [settings, setSettings] = useState({
    name: '',
    description: '',
    assets: ['XAU/USD'],
    maxParticipants: 30,
    initialCapital: 100000,
    currency: 'USD',
    spreadMultiplier: 1,
    commissionPercent: 0,
    leverage: 1,
    allowShortSelling: false,
    maxExposure: '',
    riskLimitPercent: '',
  });

  const [source, setSource] = useState({
    mode: 'scenario',
    scenarioId: 'panic_tuesday',
    symbol: 'XAU/USD',
    initialPrice: '',
    volatilityPercent: 3,
    trendPercent: 0,
    seed: 20261101,
    events: [],
    historyRange: '24h',
  });

  const [time, setTime] = useState({ durationMinutes: 30, timeframe: '1m', playbackSpeed: '' });

  const [csv, setCsv] = useState({ filename: '', content: '', preview: null, loading: false, error: '' });

  const primarySymbol = settings.assets.includes(source.symbol) ? source.symbol : settings.assets[0];
  const primaryAsset = findRoomAsset(primarySymbol);

  const setSettingsField = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));

  // Le prix de référence de l'actif est pré-rempli en marché synthétique.
  const selectMode = (mode) => {
    setSource((prev) => ({
      ...prev,
      mode,
      initialPrice:
        mode === 'synthetic' && !prev.initialPrice
          ? String(findRoomAsset(settings.assets.includes(prev.symbol) ? prev.symbol : settings.assets[0]).price)
          : prev.initialPrice,
    }));
  };
  const setSourceField = (key, value) => setSource((prev) => ({ ...prev, [key]: value }));

  const toggleAsset = (symbol) => {
    setSettings((prev) => {
      const has = prev.assets.includes(symbol);
      if (has && prev.assets.length === 1) return prev;
      const assets = has ? prev.assets.filter((s) => s !== symbol) : [...prev.assets, symbol];
      if (has && source.symbol === symbol) setSource((s) => ({ ...s, symbol: assets[0] }));
      return { ...prev, assets };
    });
  };

  // Durée réelle du jeu de données rejoué → vitesse de lecture automatique.
  const datasetSeconds = useMemo(() => {
    if (source.mode === 'historical') return HISTORY_RANGE_SECONDS[source.historyRange] ?? 3600;
    if (source.mode === 'csv') return num(csv.preview?.summary?.spanSeconds, 0);
    if (source.mode === 'scenario') return 1800;
    return 0;
  }, [source.mode, source.historyRange, csv.preview]);

  const autoSpeed = useMemo(() => {
    if (source.mode === 'live') return 1;
    if (source.mode === 'synthetic') return num(time.playbackSpeed, 1);
    if (!datasetSeconds) return 1;
    const raw = datasetSeconds / (Number(time.durationMinutes) * 60);
    return Math.round(raw * 100) / 100;
  }, [source.mode, datasetSeconds, time.durationMinutes, time.playbackSpeed]);

  const effectiveSpeed = source.mode === 'live' || source.mode === 'scenario' || source.mode === 'historical' || source.mode === 'csv'
    ? autoSpeed
    : num(time.playbackSpeed, autoSpeed);

  const simulatedSpanLabel = useMemo(() => {
    if (source.mode === 'scenario') return '30 min de scénario';
    if (source.mode === 'live') return `${time.durationMinutes} min en temps réel`;
    if (!datasetSeconds) return `${time.durationMinutes} min de simulation`;
    const hours = datasetSeconds / 3600;
    return hours >= 1
      ? `${hours.toFixed(hours >= 10 ? 0 : 1)} h de marché rejouées`
      : `${Math.round(datasetSeconds / 60)} min de marché rejouées`;
  }, [source.mode, datasetSeconds, time.durationMinutes]);

  const addEvent = () =>
    setSource((prev) => ({
      ...prev,
      events: [...prev.events, { atPercent: 50, priceJumpPercent: -3, label: '' }],
    }));

  const updateEvent = (index, key, value) =>
    setSource((prev) => ({
      ...prev,
      events: prev.events.map((ev, i) => (i === index ? { ...ev, [key]: value } : ev)),
    }));

  const removeEvent = (index) =>
    setSource((prev) => ({ ...prev, events: prev.events.filter((_, i) => i !== index) }));

  const handleCsvFile = async (file) => {
    if (!file) return;
    setError('');
    setCsv((prev) => ({ ...prev, loading: true, error: '', filename: file.name }));
    try {
      const content = await file.text();
      const preview = await previewCsv(content, file.name);
      setCsv({ filename: file.name, content, preview, loading: false, error: '' });
    } catch (err) {
      setCsv((prev) => ({ ...prev, preview: null, content: '', loading: false, error: err.message || 'Lecture du fichier impossible.' }));
    }
  };

  const stepErrors = () => {
    if (step === 1) {
      if (!settings.name.trim()) return 'Le nom de la salle est obligatoire.';
      if (settings.assets.length === 0) return 'Sélectionnez au moins un actif négociable.';
    }
    if (step === 2 && source.mode === 'csv' && !csv.preview?.valid) {
      return csv.error || 'Importez et validez un fichier CSV contenant au moins deux bougies.';
    }
    if (step === 2 && source.mode === 'synthetic' && num(source.initialPrice, primaryAsset.price) <= 0) {
      return 'Le prix initial du marché synthétique doit être supérieur à 0.';
    }
    return '';
  };

  const goNext = () => {
    const message = stepErrors();
    setError(message);
    if (message) return;
    setError('');
    const next = Math.min(step + 1, STEPS.length);
    setStep(next);
    if (next === STEPS.length) {
      // Le bouton « Créer la salle » prend la place exacte de « Continuer » :
      // laisser inactif 500 ms absorbe le second clic d'un double-clic impatient.
      setSubmitReady(false);
      clearTimeout(armTimerRef.current);
      armTimerRef.current = setTimeout(() => setSubmitReady(true), 500);
    }
  };

  useEffect(() => () => clearTimeout(armTimerRef.current), []);

  const buildPayload = () => {
    const sourcePayload = { mode: source.mode };
    if (source.mode !== 'scenario') sourcePayload.symbol = primarySymbol;
    if (source.mode === 'synthetic') {
      sourcePayload.initialPrice = num(source.initialPrice, primaryAsset.price);
      sourcePayload.volatilityPercent = num(source.volatilityPercent, 3);
      sourcePayload.trendPercent = num(source.trendPercent, 0);
      sourcePayload.seed = num(source.seed, 20261101);
      const events = source.events
        .map((ev) => ({
          atPercent: num(ev.atPercent, 50),
          priceJumpPercent: num(ev.priceJumpPercent, 0),
          ...(ev.label?.trim() ? { label: ev.label.trim().slice(0, 120) } : {}),
        }))
        .filter((ev) => ev.priceJumpPercent !== 0);
      if (events.length) sourcePayload.events = events;
    }
    if (source.mode === 'historical') sourcePayload.historyRange = source.historyRange;
    if (source.mode === 'csv') sourcePayload.csvContent = csv.content;

    const payload = {
      name: settings.name.trim(),
      scenarioId: source.mode === 'scenario' ? source.scenarioId : undefined,
      config: {
        description: settings.description.trim() || undefined,
        assets: settings.assets,
        maxParticipants: Number(settings.maxParticipants),
        initialCapital: Number(settings.initialCapital),
        currency: settings.currency,
        spreadMultiplier: num(settings.spreadMultiplier, 1),
        commissionPercent: num(settings.commissionPercent, 0),
        leverage: num(settings.leverage, 1),
        allowShortSelling: Boolean(settings.allowShortSelling),
        maxExposure: num(settings.maxExposure),
        riskLimitPercent: num(settings.riskLimitPercent),
      },
      source: sourcePayload,
      time: {
        durationMinutes: Number(time.durationMinutes),
        timeframe: time.timeframe,
        ...(source.mode === 'synthetic' ? { playbackSpeed: num(time.playbackSpeed) } : {}),
      },
    };
    // `undefined` ne se sérialise pas : le backend applique ses propres défauts.
    Object.keys(payload.config).forEach((key) => payload.config[key] === undefined && delete payload.config[key]);
    Object.keys(payload.time).forEach((key) => payload.time[key] === undefined && delete payload.time[key]);
    if (!payload.scenarioId) delete payload.scenarioId;
    if (!payload.config.description) delete payload.config.description;
    return payload;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (step === STEPS.length && !submitReady) return;
    const message = stepErrors();
    if (message) {
      setError(message);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const room = await createGameRoom(buildPayload());
      onCreated?.(room);
    } catch (err) {
      setError(err.message || 'La création de la salle a échoué.');
    } finally {
      setSubmitting(false);
    }
  };

  // Entrée dans un champ ne doit jamais soumettre le wizard : ni avant
  // l'étape 4 (création en sautant le récapitulatif), ni à l'étape 4
  // (création par réflexe de navigation). La soumission passe par un clic.
  const handleKeyDown = (event) => {
    const tag = event.target.tagName;
    if (event.key === 'Enter' && (tag === 'INPUT' || tag === 'SELECT')) {
      event.preventDefault();
    }
  };

  return (
    <div className="gr-modal-backdrop" onClick={onClose}>
      <div className="gr-modal gr-modal--wizard" onClick={(e) => e.stopPropagation()}>
        <div className="gr-wizard__head">
          <div>
            <span className="gr-eyebrow">MENEUR DE JEU · NOUVELLE SÉANCE</span>
            <h3>Créer et configurer une Game Room</h3>
          </div>
          <button type="button" className="gr-modal__close" onClick={onClose} title="Fermer">✕</button>
        </div>

        <ol className="gr-wizard__steps">
          {STEPS.map((item) => (
            <li
              key={item.id}
              className={`gr-wizard__step ${item.id === step ? 'is-active' : ''} ${item.id < step ? 'is-done' : ''}`}
            >
              <span className="gr-wizard__step-num">{item.id < step ? '✓' : item.id}</span>
              {item.label}
            </li>
          ))}
        </ol>

        {error && <div className="gr-wizard__error" role="alert">{error}</div>}

        <form className="gr-wizard__body" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          {/* ── ÉTAPE 1 : Identité de la salle ─────────────────────────── */}
          {step === 1 && (
            <div className="gr-wizard__panel">
              <div className="gr-field">
                <label htmlFor="roomName">Nom de la salle *</label>
                <input
                  id="roomName"
                  type="text"
                  maxLength={100}
                  className="gr-input"
                  placeholder="Ex : Séance 3 — Krach sur l’or"
                  value={settings.name}
                  onChange={(e) => setSettingsField('name', e.target.value)}
                  required
                />
              </div>

              <div className="gr-field">
                <label htmlFor="roomDescription">Description / consignes pédagogiques</label>
                <textarea
                  id="roomDescription"
                  className="gr-input gr-textarea"
                  rows={3}
                  maxLength={1000}
                  placeholder="Objectifs de la séance, règles imposées aux étudiants…"
                  value={settings.description}
                  onChange={(e) => setSettingsField('description', e.target.value)}
                />
              </div>

              <div className="gr-field">
                <span className="gr-field__label">Actifs négociables * ({settings.assets.length} sélectionné{settings.assets.length > 1 ? 's' : ''})</span>
                <GrAssetPicker assets={settings.assets} onToggle={toggleAsset} />
                <small className="gr-wizard__hint">
                  Choisis un marché puis cherche l’actif : le nombre d’actifs négociables est libre.
                </small>
              </div>

              <div className="gr-field-grid">
                <div className="gr-field">
                  <label htmlFor="roomMaxParticipants">Participants max.</label>
                  <input
                    id="roomMaxParticipants"
                    type="number"
                    min={1}
                    max={200}
                    className="gr-input"
                    value={settings.maxParticipants}
                    onChange={(e) => setSettingsField('maxParticipants', e.target.value)}
                  />
                </div>
                <div className="gr-field">
                  <label htmlFor="roomCapital">Capital initial par étudiant</label>
                  <input
                    id="roomCapital"
                    type="number"
                    min={100}
                    step={1000}
                    className="gr-input"
                    value={settings.initialCapital}
                    onChange={(e) => setSettingsField('initialCapital', e.target.value)}
                  />
                </div>
                <div className="gr-field">
                  <label htmlFor="roomCurrency">Devise du compte</label>
                  <select
                    id="roomCurrency"
                    className="gr-input"
                    value={settings.currency}
                    onChange={(e) => setSettingsField('currency', e.target.value)}
                  >
                    <option value="USD">USD — Dollar américain</option>
                    <option value="EUR">EUR — Euro</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 2 : Source de données marché ─────────────────────── */}
          {step === 2 && (
            <div className="gr-wizard__panel">
              <div className="gr-source-picker">
                {SOURCE_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    className={`gr-source-card ${source.mode === mode.value ? 'is-active' : ''}`}
                    onClick={() => selectMode(mode.value)}
                  >
                    <strong>{mode.label}</strong>
                    <small>{mode.hint}</small>
                  </button>
                ))}
              </div>

              {source.mode !== 'scenario' && (
                <div className="gr-field">
                  <label htmlFor="sourceSymbol">Actif suivi par le flux de marché</label>
                  <select
                    id="sourceSymbol"
                    className="gr-input"
                    value={primarySymbol}
                    onChange={(e) => setSourceField('symbol', e.target.value)}
                  >
                    {settings.assets.map((symbol) => (
                      <option key={symbol} value={symbol}>{symbol} — {findRoomAsset(symbol).name}</option>
                    ))}
                  </select>
                </div>
              )}

              {source.mode === 'scenario' && (
                <p className="gr-wizard__hint">
                  Le scénario « Le mardi de la panique » déroule une séquence de prix écrite à l’avance
                  (30 minutes de simulation) : ouverture calme, rumeur de marché, chute brutale puis élargissement du spread.
                </p>
              )}

              {source.mode === 'synthetic' && (
                <div className="gr-wizard__block">
                  <div className="gr-field-grid">
                    <div className="gr-field">
                      <label htmlFor="synthPrice">Prix initial ({primaryAsset.symbol})</label>
                      <input
                        id="synthPrice"
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        className="gr-input"
                        placeholder={String(primaryAsset.price)}
                        value={source.initialPrice}
                        onChange={(e) => setSourceField('initialPrice', e.target.value)}
                      />
                    </div>
                    <div className="gr-field">
                      <label htmlFor="synthVol">Volatilité (%)</label>
                      <input
                        id="synthVol"
                        type="number"
                        step="0.1"
                        min="0"
                        max="200"
                        className="gr-input"
                        value={source.volatilityPercent}
                        onChange={(e) => setSourceField('volatilityPercent', e.target.value)}
                      />
                    </div>
                    <div className="gr-field">
                      <label htmlFor="synthTrend">Tendance sur la séance (%)</label>
                      <input
                        id="synthTrend"
                        type="number"
                        step="0.1"
                        min="-99"
                        max="1000"
                        className="gr-input"
                        value={source.trendPercent}
                        onChange={(e) => setSourceField('trendPercent', e.target.value)}
                      />
                    </div>
                    <div className="gr-field">
                      <label htmlFor="synthSeed">Graine aléatoire</label>
                      <input
                        id="synthSeed"
                        type="number"
                        min="1"
                        className="gr-input"
                        value={source.seed}
                        onChange={(e) => setSourceField('seed', e.target.value)}
                      />
                    </div>
                  </div>
                  <small className="gr-wizard__hint">
                    La même graine reproduit exactement la même courbe pour toutes les salles : utile pour comparer deux promotions.
                  </small>

                  <div className="gr-events">
                    <div className="gr-events__head">
                      <span>Événements programmés</span>
                      <button type="button" className="gr-btn-pill" onClick={addEvent}>+ Ajouter</button>
                    </div>
                    {source.events.length === 0 && (
                      <small className="gr-wizard__hint">
                        Aucun événement : la courbe suivra uniquement la tendance et la volatilité choisies.
                      </small>
                    )}
                    {source.events.map((ev, index) => (
                      <div className="gr-event-row" key={index}>
                        <label>
                          <span>À</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={ev.atPercent}
                            onChange={(e) => updateEvent(index, 'atPercent', e.target.value)}
                          />
                          <span>%</span>
                        </label>
                        <label>
                          <span>Saut de prix</span>
                          <input
                            type="number"
                            step="0.5"
                            min="-90"
                            max="1000"
                            value={ev.priceJumpPercent}
                            onChange={(e) => updateEvent(index, 'priceJumpPercent', e.target.value)}
                          />
                          <span>%</span>
                        </label>
                        <input
                          type="text"
                          maxLength={120}
                          placeholder="Libellé (ex : Annonce Fed)"
                          value={ev.label}
                          onChange={(e) => updateEvent(index, 'label', e.target.value)}
                        />
                        <button type="button" className="gr-btn-icon" onClick={() => removeEvent(index)} title="Supprimer">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {source.mode === 'historical' && (
                <div className="gr-field">
                  <label htmlFor="historyRange">Fenêtre historique rejouée</label>
                  <select
                    id="historyRange"
                    className="gr-input"
                    value={source.historyRange}
                    onChange={(e) => setSourceField('historyRange', e.target.value)}
                  >
                    {HISTORY_RANGE_CHOICES.map((range) => (
                      <option key={range.value} value={range.value}>{range.label}</option>
                    ))}
                  </select>
                  <small className="gr-wizard__hint">
                    Les ticks proviennent de la table <code>market_ticks</code> déjà alimentée par le module Marché.
                    Les dates de début et de fin réelles sont calculées au lancement.
                  </small>
                </div>
              )}

              {source.mode === 'csv' && (
                <div className="gr-wizard__block">
                  <label className="gr-csv-drop" htmlFor="csvFile">
                    <input
                      id="csvFile"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => handleCsvFile(e.target.files?.[0])}
                    />
                    <strong>{csv.loading ? 'Validation en cours…' : 'Choisir un fichier CSV de bougies'}</strong>
                    <small>
                      Colonnes attendues : timestamp, open, high, low, close, volume (optionnel).
                      Séparateur <code>,</code> <code>;</code> ou tabulation, en-tête facultatif, 20 000 lignes maximum.
                    </small>
                  </label>

                  {csv.error && <div className="gr-wizard__error" role="alert">{csv.error}</div>}

                  {csv.preview && (
                    <div className="gr-csv-preview">
                      <div className={`gr-csv-status ${csv.preview.valid ? 'is-ok' : 'is-ko'}`}>
                        {csv.preview.valid
                          ? `Fichier valide · ${csv.preview.candlesCount.toLocaleString('fr-FR')} bougies détectées`
                          : 'Fichier inutilisable : moins de deux bougies valides'}
                        {csv.preview.issuesCount > 0 && ` · ${csv.preview.issuesCount} ligne(s) ignorée(s)`}
                      </div>

                      <dl className="gr-csv-summary">
                        <div><dt>Début</dt><dd>{csv.preview.summary.startAt || '—'}</dd></div>
                        <div><dt>Fin</dt><dd>{csv.preview.summary.endAt || '—'}</dd></div>
                        <div><dt>Amplitude</dt><dd>{Math.round((csv.preview.summary.spanSeconds || 0) / 60).toLocaleString('fr-FR')} min</dd></div>
                        <div><dt>Clôture min / max</dt><dd>{csv.preview.summary.minClose ?? '—'} / {csv.preview.summary.maxClose ?? '—'}</dd></div>
                      </dl>

                      {csv.preview.issues?.length > 0 && (
                        <div className="gr-csv-issues">
                          <span>Lignes rejetées :</span>
                          <ul>
                            {csv.preview.issues.slice(0, 8).map((issue, index) => (
                              <li key={index}>Ligne {issue.line} : {issue.message}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="gr-table-wrap gr-table-wrap--csv">
                        <table className="gr-table">
                          <thead>
                            <tr><th>Timestamp</th><th>Ouverture</th><th>Haut</th><th>Bas</th><th>Clôture</th><th>Volume</th></tr>
                          </thead>
                          <tbody>
                            {csv.preview.candles.slice(0, 8).map((candle) => (
                              <tr key={candle.timestamp}>
                                <td>{candle.timestamp}</td>
                                <td>{candle.open}</td>
                                <td>{candle.high}</td>
                                <td>{candle.low}</td>
                                <td>{candle.close}</td>
                                <td>{candle.volume ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <small className="gr-wizard__hint">
                        Aperçu limité aux 8 premières bougies ; la totalité du fichier est enregistrée avec la salle.
                      </small>
                    </div>
                  )}
                </div>
              )}

              {source.mode === 'live' && (
                <p className="gr-wizard__hint">
                  Les cotations réelles sont figées en base toutes les 2 secondes : chaque étudiant de la salle
                  voit exactement le même prix au même instant. La vitesse est imposée à 1x et l’horodatage est réel.
                </p>
              )}
            </div>
          )}

          {/* ── ÉTAPE 3 : Configuration du temps ───────────────────────── */}
          {step === 3 && (
            <div className="gr-wizard__panel">
              <div className="gr-field">
                <span className="gr-field__label">Durée réelle de la séance</span>
                <div className="gr-presets gr-presets--durations">
                  {DURATION_CHOICES.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      className={Number(time.durationMinutes) === choice ? 'is-active' : ''}
                      onClick={() => setTime((prev) => ({ ...prev, durationMinutes: choice }))}
                    >
                      {choice} min
                    </button>
                  ))}
                </div>
              </div>

              <div className="gr-field-grid">
                <div className="gr-field">
                  <label htmlFor="timeframe">Unité de temps des bougies</label>
                  <select
                    id="timeframe"
                    className="gr-input"
                    value={time.timeframe}
                    onChange={(e) => setTime((prev) => ({ ...prev, timeframe: e.target.value }))}
                  >
                    {TIMEFRAME_CHOICES.map((tf) => (
                      <option key={tf} value={tf}>{tf}</option>
                    ))}
                  </select>
                </div>

                <div className="gr-field">
                  <label htmlFor="playbackSpeed">Vitesse de relecture</label>
                  <input
                    id="playbackSpeed"
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="1000"
                    className="gr-input"
                    placeholder={`Auto : x${autoSpeed}`}
                    disabled={source.mode !== 'synthetic'}
                    value={source.mode === 'synthetic' ? time.playbackSpeed : ''}
                    onChange={(e) => setTime((prev) => ({ ...prev, playbackSpeed: e.target.value }))}
                  />
                </div>
              </div>

              <div className="gr-time-summary">
                <div>
                  <span className="gr-eyebrow">CALCUL AUTOMATIQUE</span>
                  <strong>x{effectiveSpeed}</strong>
                </div>
                <p>
                  {simulatedSpanLabel} en {time.durationMinutes} min réelles, bougies {time.timeframe}.
                  {source.mode === 'live' && ' En direct, la vitesse reste fixée à 1x.'}
                </p>
              </div>

              {source.mode !== 'live' && source.mode !== 'synthetic' && (
                <small className="gr-wizard__hint">
                  Exemple : 6 h de marché rejouées en 30 min réelles ⇒ vitesse x12, calculée automatiquement.
                </small>
              )}
            </div>
          )}

          {/* ── ÉTAPE 4 : Frais, levier et limites de risque ───────────── */}
          {step === 4 && (
            <div className="gr-wizard__panel">
              <div className="gr-field-grid">
                <div className="gr-field">
                  <label htmlFor="spreadMultiplier">Multiplicateur de spread</label>
                  <input
                    id="spreadMultiplier"
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="50"
                    className="gr-input"
                    value={settings.spreadMultiplier}
                    onChange={(e) => setSettingsField('spreadMultiplier', e.target.value)}
                  />
                  <small className="gr-wizard__hint">1 = spread normal, 4 = conditions stressées.</small>
                </div>
                <div className="gr-field">
                  <label htmlFor="commissionPercent">Commission (% du nominal)</label>
                  <input
                    id="commissionPercent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="5"
                    className="gr-input"
                    value={settings.commissionPercent}
                    onChange={(e) => setSettingsField('commissionPercent', e.target.value)}
                  />
                </div>
                <div className="gr-field">
                  <label htmlFor="leverage">Effet de levier</label>
                  <input
                    id="leverage"
                    type="number"
                    step="1"
                    min="1"
                    max="100"
                    className="gr-input"
                    value={settings.leverage}
                    onChange={(e) => setSettingsField('leverage', e.target.value)}
                  />
                  <small className="gr-wizard__hint">Le levier immobilise nominal ÷ levier de marge à l’ouverture.</small>
                </div>
              </div>

              <div className="gr-field-grid">
                <div className="gr-field">
                  <label htmlFor="maxExposure">Exposition maximale ({settings.currency})</label>
                  <input
                    id="maxExposure"
                    type="number"
                    step="1000"
                    min="1"
                    className="gr-input"
                    placeholder="Illimitée"
                    value={settings.maxExposure}
                    onChange={(e) => setSettingsField('maxExposure', e.target.value)}
                  />
                </div>
                <div className="gr-field">
                  <label htmlFor="riskLimitPercent">Risque max. par position (% du capital)</label>
                  <input
                    id="riskLimitPercent"
                    type="number"
                    step="0.5"
                    min="0.1"
                    max="100"
                    className="gr-input"
                    placeholder="Aucune limite"
                    value={settings.riskLimitPercent}
                    onChange={(e) => setSettingsField('riskLimitPercent', e.target.value)}
                  />
                  <small className="gr-wizard__hint">
                    Une limite impose un Stop-Loss sur chaque position ouverte.
                  </small>
                </div>
              </div>

              <label className="gr-checkbox">
                <input
                  type="checkbox"
                  checked={settings.allowShortSelling}
                  onChange={(e) => setSettingsField('allowShortSelling', e.target.checked)}
                />
                <span>
                  <strong>Autoriser la vente à découvert (short)</strong>
                  <small>Les étudiants pourront vendre sans détenir l’actif ; la quantité devient négative.</small>
                </span>
              </label>

              <div className="gr-wizard__recap">
                <span className="gr-eyebrow">RÉCAPITULATIF</span>
                <ul>
                  <li><span>Salle</span><strong>{settings.name.trim() || '—'}</strong></li>
                  <li><span>Actifs</span><strong>{settings.assets.join(', ')}</strong></li>
                  <li><span>Source</span><strong>{SOURCE_MODES.find((m) => m.value === source.mode)?.label}</strong></li>
                  <li><span>Durée réelle</span><strong>{time.durationMinutes} min · x{effectiveSpeed}</strong></li>
                  <li><span>Capital</span><strong>{Number(settings.initialCapital).toLocaleString('fr-FR')} {settings.currency}</strong></li>
                  <li><span>Levier / commission</span><strong>x{num(settings.leverage, 1)} · {num(settings.commissionPercent, 0)} %</strong></li>
                  <li><span>Short</span><strong>{settings.allowShortSelling ? 'Autorisé' : 'Interdit'}</strong></li>
                </ul>
              </div>
            </div>
          )}

          <div className="gr-modal__actions gr-wizard__actions">
            <button
              type="button"
              className="gr-btn gr-btn--cancel"
              onClick={() => (step === 1 ? onClose() : setStep(step - 1))}
              disabled={submitting}
            >
              {step === 1 ? 'Annuler' : '← Retour'}
            </button>
            {step < STEPS.length ? (
              <button type="button" className="gr-btn gr-btn--primary" onClick={goNext}>
                Continuer →
              </button>
            ) : (
              <button
                type="submit"
                className="gr-btn gr-btn--start"
                disabled={submitting || !submitReady}
                title={submitReady ? '' : 'Un instant…'}
              >
                {submitting ? 'Création…' : 'Créer la salle'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
