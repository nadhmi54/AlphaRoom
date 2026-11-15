import { buy, liveSession } from '../fixtures/live-session.js';
import type { SessionData } from '../contract/session-data.js';
import { MarketAnalysisService } from '../market/market-analysis.service.js';
import { analysableSymbols, type AssetHistory } from '../market/history.js';
import { hashSeed } from '../market/montecarlo.js';
import { candlesFrom } from '../market/test-data.js';
import { findMarketAsset } from '../../portefeuille/trading/market-assets.js';

/**
 * Décor FIXE du banc d'évaluation : une séance (le trader « a » détient 20 XAU/USD avec un stop-loss,
 * « b » et « c » existent pour tester l'isolation) et un historique de marché synthétique mais
 * déterministe. Les résultats ne dépendent donc ni du réseau ni de l'heure : seul le modèle varie.
 */
export function buildEvalSession(): SessionData {
  return liveSession({
    minute: 14,
    participants: [
      { id: 'a', displayName: 'Étudiant évalué', trades: [buy('t1', 5, 20, 2700)], protections: [{ minute: 5, symbol: 'XAU/USD', stopLoss: 2650, takeProfit: null }] },
      { id: 'b', displayName: 'Sarra', trades: [buy('t9', 6, 99, 2700)] },
      { id: 'c', displayName: 'Amine' },
    ],
  });
}

function syntheticHistory(symbol: string): AssetHistory {
  const category = findMarketAsset(symbol)?.category ?? 'stock';
  const seed = hashSeed(symbol);
  const drift = ((seed % 1000) / 1000) * 0.01 - 0.004; // de -0,4 % à +0,6 % par jour, fixé par l'actif
  const phase = (seed % 7) + 1;
  const start = 20 + (seed % 5000) / 10;
  const closes = Array.from({ length: 130 }, (_, i) => start * (1 + drift) ** i * (1 + 0.012 * Math.sin(i / phase) + 0.006 * Math.cos(i / 3)));
  return { symbol, category, candles: candlesFrom(closes), source: category === 'crypto' ? 'binance' : 'yahoo', providerSymbol: symbol, proxy: false };
}

export function buildEvalMarket(): MarketAnalysisService {
  const history = {
    get: async (symbol: string) => (analysableSymbols().includes(symbol) ? syntheticHistory(symbol) : null),
    getMany: async (symbols: string[]) => symbols.map((symbol) => syntheticHistory(symbol)),
  };
  return new MarketAnalysisService(history as never);
}
