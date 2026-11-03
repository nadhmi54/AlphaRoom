import { useMemo, useState } from 'react';
import { ROOM_ASSETS, findRoomAsset, formatPrice } from '../../data/roomAssets.js';

/** Les quatre marchés, mêmes libellés et icônes que la scène « marché ». */
const MARKETS = [
  {
    id: 'crypto',
    label: 'Crypto',
    icon: '₿',
    hint: 'BTC, ETH, BNB, SOL…',
    placeholder: 'Rechercher une crypto… (BTC, ETH, SOL…)',
  },
  {
    id: 'stock',
    label: 'Actions',
    icon: '▤',
    hint: 'Apple, Microsoft, Tesla…',
    placeholder: 'Rechercher une action… (AAPL, MSFT, TSLA…)',
  },
  {
    id: 'commodity',
    label: 'Matières premières',
    icon: '◈',
    hint: 'Or, pétrole, argent…',
    placeholder: 'Rechercher une matière première… (or, pétrole…)',
  },
  {
    id: 'forex',
    label: 'Devises',
    icon: '€$',
    hint: 'EUR/USD, GBP/USD…',
    placeholder: 'Rechercher une devise… (EUR/USD, GBP/USD…)',
  },
];

const fold = (value) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Sélecteur des actifs négociables d'une salle : la barre de recherche et les
 * quatre marchés de la scène « marché », en sélection multiple. Le nombre
 * d'actifs est libre, le catalogue reste celui que le backend sait coter.
 */
export default function GrAssetPicker({ assets, onToggle }) {
  const [market, setMarket] = useState(() => {
    const initial = findRoomAsset(assets[0]).marketId;
    return MARKETS.some((item) => item.id === initial) ? initial : MARKETS[0].id;
  });
  const [query, setQuery] = useState('');

  const byMarket = useMemo(() => {
    const groups = new Map(MARKETS.map((item) => [item.id, []]));
    for (const asset of ROOM_ASSETS) groups.get(asset.marketId)?.push(asset);
    return groups;
  }, []);

  const meta = MARKETS.find((item) => item.id === market) ?? MARKETS[0];
  const needle = fold(query.trim());
  const results = (byMarket.get(meta.id) ?? []).filter(
    (asset) => !needle || fold(asset.symbol).includes(needle) || fold(asset.name).includes(needle),
  );
  const countIn = (id) => assets.filter((symbol) => findRoomAsset(symbol).marketId === id).length;

  return (
    <div className="gr-asset-selector">
      <div className="gr-market-bar">
        <nav className="gr-market-nav" aria-label="Marchés disponibles">
          <span className="gr-market-nav__title">Marchés</span>
          <div className="gr-market-nav__list" role="group" aria-label="Choisir un marché">
            {MARKETS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`gr-market-nav__btn${market === item.id ? ' is-active' : ''}`}
                aria-pressed={market === item.id}
                title={item.hint}
                onClick={() => {
                  setMarket(item.id);
                  setQuery('');
                }}
              >
                <span className="gr-market-nav__icon" aria-hidden="true">{item.icon}</span>
                <span className="gr-market-nav__label">{item.label}</span>
                {countIn(item.id) > 0 && <span className="gr-market-nav__count">{countIn(item.id)}</span>}
              </button>
            ))}
          </div>
        </nav>

        <div className="gr-market-bar__search">
          <div className="gr-search">
            <svg className="gr-search__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              className="gr-search__input"
              placeholder={meta.placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={`Rechercher un actif ${meta.label.toLowerCase()}`}
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                className="gr-search__clear"
                aria-label="Effacer la recherche"
                onClick={() => setQuery('')}
              >
                ×
              </button>
            )}
          </div>
          <p className="gr-market-bar__hint">{meta.hint}</p>

          <div className="gr-asset-picker" role="group" aria-label={`Actifs ${meta.label}`}>
            {results.map((asset) => (
              <button
                key={asset.symbol}
                type="button"
                className={`gr-asset-chip ${assets.includes(asset.symbol) ? 'is-active' : ''}`}
                aria-pressed={assets.includes(asset.symbol)}
                onClick={() => onToggle(asset.symbol)}
                title={`${asset.name} — unité : ${asset.unit}`}
              >
                <strong>{asset.symbol}</strong>
                <small>{asset.name}</small>
                <small className="gr-asset-chip__price">{formatPrice(asset.price, asset.symbol)} $</small>
              </button>
            ))}
          </div>

          {results.length === 0 && (
            <p className="gr-asset-empty">Aucun actif trouvé pour « {query} »</p>
          )}
        </div>
      </div>

      <ul className="gr-asset-selected" aria-label="Actifs sélectionnés">
        {assets.map((symbol) => (
          <li key={symbol}>
            <span>{symbol}</span>
            <button type="button" aria-label={`Retirer ${symbol}`} onClick={() => onToggle(symbol)}>✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
