import { Injectable } from '@nestjs/common';
import { round } from '../contract/equity.js';
import { canonicalEngineSymbol } from '../../portefeuille/market-data/market-feed-config.js';
import { ASSET_CATEGORIES, roundAssetPrice, type AssetCategory } from '../../portefeuille/trading/market-assets.js';
import {
  CRITERIA,
  DISCLAIMER,
  HORIZONS,
  MARKET_LABELS,
  RSI_OVERBOUGHT,
  RSI_OVERSOLD,
  analyzeHistory,
  rankAssets,
  rankMarkets,
  readAsset,
  suggestLevels,
  summaryRow,
  type AssetAnalysis,
  type Criterion,
  type Horizon,
} from './analysis.js';
import { backtestSignal, describeBacktest } from './backtest.js';
import { MarketHistoryService, analysableSymbols, type AssetHistory } from './history.js';
import { CRYPTO_DAYS, TRADING_DAYS } from './indicators.js';
import { MAX_DAYS, describeSimulation, simulateOutcomes } from './montecarlo.js';

/** Ce que l'agent coach voit du module d'analyse : deux appels asynchrones, jamais d'exception. */
export interface MarketToolsPort {
  scan(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  analyze(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Simulation Monte Carlo sur la volatilité réelle (probabilités de perte, de toucher un stop…). */
  simulate(args: Record<string, unknown>, position?: PositionContext): Promise<Record<string, unknown>>;
  /** Ce que la lecture « règles simples » aurait donné sur l'historique réel. */
  backtest(args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/** Position réelle du trader, fixée par le serveur (jamais par le modèle) pour chiffrer la simulation. */
export interface PositionContext {
  value: number;
  portfolioTotal: number;
}

const MARKET_ALIASES: Record<string, AssetCategory | 'all'> = {
  all: 'all',
  tous: 'all',
  crypto: 'crypto',
  cryptos: 'crypto',
  stock: 'stock',
  actions: 'stock',
  action: 'stock',
  commodity: 'commodity',
  'matieres premieres': 'commodity',
  'matières premières': 'commodity',
  commodities: 'commodity',
  forex: 'forex',
  devises: 'forex',
  devise: 'forex',
};

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const PARAMETERS = {
  sma_courte: 20,
  sma_longue: 50,
  rsi_surachat: RSI_OVERBOUGHT,
  rsi_survente: RSI_OVERSOLD,
  stop_en_amplitudes_journalieres: 2,
  objectif_en_amplitudes_journalieres: 3,
};

@Injectable()
export class MarketAnalysisService implements MarketToolsPort {
  constructor(private readonly history: MarketHistoryService) {}

  /** Classement des actifs et comparaison des marchés sur un horizon. */
  async scan(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const horizon = pick<Horizon>(args.horizon, HORIZONS, 'mois');
    const criterion = pick<Criterion>(args.critere, CRITERIA, 'ajuste_au_risque');
    const requested = typeof args.marche === 'string' ? (MARKET_ALIASES[args.marche.toLowerCase()] ?? 'all') : 'all';
    const limit = Math.min(Math.max(Math.trunc(Number(args.limite)) || 8, 1), 12);

    const symbols = analysableSymbols();
    const histories = await this.history.getMany(symbols);
    const analyses: AssetAnalysis[] = [];
    const unavailable: string[] = [];
    histories.forEach((history, index) => {
      const analysis = history ? analyzeHistory(history, horizon) : null;
      if (analysis) analyses.push(analysis);
      else unavailable.push(symbols[index]!);
    });
    if (analyses.length === 0) {
      return { erreur: 'Historique de marché indisponible pour le moment (fournisseurs injoignables). Dis-le à l’étudiant et propose de réessayer plus tard.' };
    }

    const scoped = requested === 'all' ? analyses : analyses.filter((a) => a.category === requested);
    if (scoped.length === 0) return { erreur: 'Aucun actif disponible pour ce marché.', marches_disponibles: ASSET_CATEGORIES.map((c) => MARKET_LABELS[c]) };

    const ranked = rankAssets(scoped, criterion);
    return {
      horizon,
      critere: criterion === 'ajuste_au_risque' ? 'rendement ajusté au risque' : 'rendement brut',
      perimetre: requested === 'all' ? 'tous les marchés' : MARKET_LABELS[requested],
      date_derniere_bougie: scoped.map((a) => a.asOf).sort().at(-1),
      marches: rankMarkets(scoped, criterion),
      meilleurs_actifs: ranked.slice(0, limit).map((a, i) => summaryRow(a, i + 1)),
      moins_bons_actifs: ranked.length > limit ? ranked.slice(-Math.min(3, ranked.length - limit)).map((a) => summaryRow(a)) : [],
      actifs_analyses: scoped.length,
      actifs_indisponibles: unavailable,
      avertissement: DISCLAIMER,
    };
  }

  /** Lecture détaillée d'un actif : indicateurs, biais, niveaux d'entrée/stop/objectif. */
  async analyze(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const raw = typeof args.symbol === 'string' ? args.symbol : '';
    const symbol = canonicalEngineSymbol(raw);
    if (!symbol) return { erreur: 'Actif inconnu : utilise un symbole de la plateforme (ex. XAU/USD, EUR/USD, BTC/USDT, AAPL, WTI/USD).' };
    const horizon = pick<Horizon>(args.horizon, HORIZONS, 'mois');
    const history = await this.history.get(symbol === 'BTC/USD' ? 'BTC/USDT' : symbol);
    if (!history) return { erreur: `Historique de ${symbol} indisponible pour le moment.` };
    const analysis = analyzeHistory(history, horizon);
    if (!analysis) return { erreur: `Pas assez d'historique sur ${symbol} pour cet horizon.` };
    const month = analyzeHistory(history, 'mois');
    const reading = readAsset(analysis, month?.returnFraction ?? null);
    const levels = suggestLevels(analysis);
    return {
      ...summaryRow(analysis),
      horizon,
      derniere_bougie: analysis.asOf,
      source: analysis.source === 'binance' ? 'Binance' : 'Yahoo Finance',
      ...(analysis.proxy ? { remarque_source: 'Cours obtenu via un substitut (pas le cours officiel de l’actif).' } : {}),
      moyenne_mobile_courte: analysis.sma20 === null ? null : roundAssetPrice(symbol, analysis.sma20),
      moyenne_mobile_longue: analysis.sma50 === null ? null : roundAssetPrice(symbol, analysis.sma50),
      support_recent: analysis.support === null ? null : roundAssetPrice(symbol, analysis.support),
      resistance_recente: analysis.resistance === null ? null : roundAssetPrice(symbol, analysis.resistance),
      lecture: { biais: reading.bias, score: reading.points, score_min: -3, score_max: 3, prudence_rsi: reading.caution, raisons: reading.reasons },
      ...(reading.caution === 'surachat' && analysis.sma20 !== null ? { zone_de_repli_possible: roundAssetPrice(symbol, analysis.sma20) } : {}),
      niveaux_pedagogiques: levels,
      parametres: PARAMETERS,
      nombre_bougies: analysis.candles,
      avertissement: DISCLAIMER,
    };
  }

  private async loadHistory(raw: unknown): Promise<{ symbol: string; history: AssetHistory } | { erreur: string }> {
    const symbol = canonicalEngineSymbol(typeof raw === 'string' ? raw : '');
    if (!symbol) return { erreur: 'Actif inconnu : utilise un symbole de la plateforme (ex. XAU/USD, EUR/USD, BTC/USDT, AAPL, WTI/USD).' };
    const history = await this.history.get(symbol === 'BTC/USD' ? 'BTC/USDT' : symbol);
    if (!history) return { erreur: `Historique de ${symbol} indisponible pour le moment.` };
    return { symbol, history };
  }

  /**
   * Monte Carlo : « quelle probabilité de perdre plus de X % d'ici N jours ? », « quelle chance que mon stop saute ? ».
   * `position` (valeur de la position et du portefeuille) vient du serveur : il chiffre la perte en montant.
   */
  async simulate(args: Record<string, unknown>, position?: PositionContext): Promise<Record<string, unknown>> {
    const loaded = await this.loadHistory(args.symbol);
    if ('erreur' in loaded) return loaded;
    const { symbol, history } = loaded;
    const closes = history.candles.map((c) => c.close);
    if (closes.length < 21) return { erreur: `Pas assez d'historique sur ${symbol} pour estimer sa volatilité.` };
    const days = Math.min(Math.max(Math.trunc(Number(args.jours)) || 5, 1), MAX_DAYS);
    const stop = Number(typeof args.stop_pct === 'string' ? args.stop_pct.replace(',', '.') : args.stop_pct);
    const stopFraction = Number.isFinite(stop) && stop > 0 && stop < 50 ? stop / 100 : undefined;
    const sim = simulateOutcomes({ closes, days, ...(stopFraction !== undefined ? { stopFraction } : {}), seedKey: symbol });
    const annual = history.category === 'crypto' ? CRYPTO_DAYS : TRADING_DAYS;
    const pessimistic = sim.distribution.p5;
    return {
      actif: symbol,
      methode: 'Monte Carlo (mouvement brownien géométrique, 5 000 trajectoires), volatilité réelle des 60 derniers jours, aucune direction supposée.',
      ...describeSimulation(sim, annual),
      ...(stopFraction !== undefined ? { distance_du_stop_pct: round(stopFraction * 100, 2) } : {}),
      ...(position && position.value > 0 && position.portfolioTotal > 0
        ? {
            ta_position: {
              valeur: round(position.value, 2),
              part_du_portefeuille_pct: round((position.value / position.portfolioTotal) * 100, 2),
              perte_dans_le_scenario_pessimiste_montant: round(position.value * pessimistic, 2),
              perte_dans_le_scenario_pessimiste_du_portefeuille_pct: round(((position.value * pessimistic) / position.portfolioTotal) * 100, 2),
            },
          }
        : {}),
      derniere_bougie: history.candles.at(-1)?.t,
      source: history.source === 'binance' ? 'Binance' : 'Yahoo Finance',
      avertissement: 'Simulation fondée sur la volatilité passée : une probabilité n’est pas une prévision, et les chocs extrêmes sont plus fréquents dans la réalité que dans ce modèle.',
    };
  }

  /** Backtest de la règle de signal sur l'historique réel (aucune optimisation, mêmes règles que analyze_asset). */
  async backtest(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const loaded = await this.loadHistory(args.symbol);
    if ('erreur' in loaded) return loaded;
    const { symbol, history } = loaded;
    const forward = Math.min(Math.max(Math.trunc(Number(args.jours_apres)) || 5, 1), 20);
    const result = backtestSignal(history, forward);
    if (!result) return { erreur: `Pas assez d'historique sur ${symbol} pour tester le signal (il faut au moins ${forward + 55} jours).` };
    return {
      actif: symbol,
      ...describeBacktest(result),
      derniere_bougie: history.candles.at(-1)?.t,
      source: history.source === 'binance' ? 'Binance' : 'Yahoo Finance',
      avertissement: DISCLAIMER,
    };
  }
}
