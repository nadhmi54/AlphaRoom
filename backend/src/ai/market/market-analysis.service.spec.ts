import { describe, expect, it } from 'vitest';
import type { AssetHistory } from './history.js';
import { MarketAnalysisService } from './market-analysis.service.js';
import { historyOf, trending } from './test-data.js';

const SERIES: Record<string, AssetHistory> = {
  'XAU/USD': historyOf('XAU/USD', trending(90, 2000, 0.003)),
  'WTI/USD': historyOf('WTI/USD', trending(90, 90, -0.004)),
  'EUR/USD': historyOf('EUR/USD', trending(90, 1.08, 0.0002), 'forex'),
  'BTC/USDT': historyOf('BTC/USDT', trending(120, 60000, 0.006), 'crypto', { source: 'binance' }),
  AAPL: historyOf('AAPL', trending(90, 200, 0.001), 'stock'),
};

const fakeHistory = (available = SERIES) =>
  ({
    get: async (symbol: string) => available[symbol] ?? null,
    getMany: async (symbols: string[]) => symbols.map((s) => available[s] ?? null),
  }) as never;

describe('analyse de marché (outils du coach)', () => {
  it('classe les marchés et les actifs, signale ce qui est indisponible', async () => {
    const service = new MarketAnalysisService(fakeHistory());
    const out = (await service.scan({ horizon: 'mois', critere: 'rendement' })) as any;
    expect(out.critere).toBe('rendement brut');
    expect(out.marches[0]).toMatchObject({ rang: 1, marche: 'crypto' });
    expect(out.meilleurs_actifs[0]).toMatchObject({ rang: 1, actif: 'BTC/USDT' });
    expect(out.actifs_analyses).toBe(5);
    expect(out.actifs_indisponibles).toContain('TSLA');
    expect(out.avertissement).toContain('pas des prévisions');
  });

  it('filtre par marché, en français comme en anglais', async () => {
    const service = new MarketAnalysisService(fakeHistory());
    const out = (await service.scan({ marche: 'matières premières' })) as any;
    expect(out.perimetre).toBe('matières premières');
    expect(out.meilleurs_actifs.map((a: any) => a.actif).sort()).toEqual(['WTI/USD', 'XAU/USD']);
    expect(((await service.scan({ marche: 'devises' })) as any).meilleurs_actifs[0].actif).toBe('EUR/USD');
  });

  it('valeurs par défaut sûres quand les arguments sont absurdes', async () => {
    const service = new MarketAnalysisService(fakeHistory());
    const out = (await service.scan({ horizon: 'siècle', critere: 42, marche: 'bitcoinland', limite: 9999 })) as any;
    expect(out.horizon).toBe('mois');
    expect(out.critere).toBe('rendement ajusté au risque');
    expect(out.perimetre).toBe('tous les marchés');
  });

  it('dit clairement quand aucun fournisseur ne répond', async () => {
    const service = new MarketAnalysisService(fakeHistory({}));
    expect(((await service.scan({})) as any).erreur).toContain('indisponible');
    expect(((await service.analyze({ symbol: 'XAU/USD' })) as any).erreur).toContain('indisponible');
  });

  it('lit un actif : biais, raisons, niveaux et paramètres (pour que les chiffres cités soient vérifiables)', async () => {
    const service = new MarketAnalysisService(fakeHistory());
    const out = (await service.analyze({ symbol: 'xau/usd' })) as any;
    expect(out).toMatchObject({ actif: 'XAU/USD', tendance: 'haussière', source: 'Yahoo Finance' });
    expect(out.lecture).toMatchObject({ biais: 'haussier', prudence_rsi: 'surachat', score_max: 3 });
    expect(out.zone_de_repli_possible).toBeLessThan(out.prix);
    expect(out.lecture.raisons.length).toBeGreaterThan(0);
    expect(out.niveaux_pedagogiques.stop_suggere).toBeLessThan(out.prix);
    expect(out.parametres).toMatchObject({ sma_courte: 20, sma_longue: 50, rsi_surachat: 70, rsi_survente: 30 });
    expect(out.support_recent).toBeLessThan(out.prix);
  });

  it('refuse un actif inconnu, accepte BTC/USD comme BTC/USDT', async () => {
    const service = new MarketAnalysisService(fakeHistory());
    expect(((await service.analyze({ symbol: 'DOGE-LAND' })) as any).erreur).toContain('Actif inconnu');
    expect(((await service.analyze({ symbol: 'BTC/USD' })) as any).actif).toBe('BTC/USDT');
  });

  it('signale un cours obtenu par substitut', async () => {
    const service = new MarketAnalysisService(fakeHistory({ ...SERIES, 'XAU/USD': historyOf('XAU/USD', trending(90, 2000, 0.003), 'commodity', { source: 'binance', proxy: true }) }));
    expect(((await service.analyze({ symbol: 'XAU/USD' })) as any).remarque_source).toContain('substitut');
  });

  describe('Monte Carlo et backtest', () => {
    const wavy = (n: number) => trending(n, 2000, 0.003).map((p, i) => p * (1 + 0.01 * Math.sin(i / 2)));
    const service = () => new MarketAnalysisService(fakeHistory({ ...SERIES, 'XAU/USD': historyOf('XAU/USD', wavy(130)) }));

    it('simule : probabilités, scénarios, stop touché, et perte en montant avec la position du trader', async () => {
      const out = (await service().simulate({ symbol: 'XAU/USD', jours: 5, stop_pct: 2 }, { value: 54_000, portfolioTotal: 100_000 })) as any;
      expect(out).toMatchObject({ actif: 'XAU/USD', jours_simules: 5, nombre_de_simulations: 5000, distance_du_stop_pct: 2 });
      expect(out.probabilite_de_toucher_le_stop_pct).toBeGreaterThan(0);
      expect(out.resultat_pessimiste_5_pct).toBeLessThan(out.resultat_median_pct);
      expect(out.ta_position).toMatchObject({ valeur: 54000, part_du_portefeuille_pct: 54 });
      expect(out.ta_position.perte_dans_le_scenario_pessimiste_montant).toBeLessThan(0);
      expect(out.avertissement).toContain('pas une prévision');
    });

    it('sans position détenue ni stop : ni ta_position ni probabilité de stop ; horizon borné', async () => {
      const out = (await service().simulate({ symbol: 'XAU/USD', jours: 500 })) as any;
      expect(out.ta_position).toBeUndefined();
      expect(out.probabilite_de_toucher_le_stop_pct).toBeUndefined();
      expect(out.jours_simules).toBe(60);
      // Un stop absurde (négatif, 80 %) est ignoré plutôt que mal interprété.
      expect(((await service().simulate({ symbol: 'XAU/USD', stop_pct: -3 })) as any).distance_du_stop_pct).toBeUndefined();
      expect(((await service().simulate({ symbol: 'XAU/USD', stop_pct: 80 })) as any).distance_du_stop_pct).toBeUndefined();
    });

    it('donne deux fois le même résultat pour la même question', async () => {
      expect(await service().simulate({ symbol: 'XAU/USD', jours: 5 })).toEqual(await service().simulate({ symbol: 'XAU/USD', jours: 5 }));
    });

    it('backteste le signal et rappelle les limites', async () => {
      const out = (await service().backtest({ symbol: 'XAU/USD', jours_apres: 5 })) as any;
      expect(out).toMatchObject({ actif: 'XAU/USD', horizon_apres_signal_jours: 5, biais_actuel: 'haussier' });
      expect(out.signal_haussier.observations).toBeGreaterThan(20);
      expect(out.limites).toContain('chevauchent');
    });

    it('erreurs lisibles : actif inconnu, historique indisponible ou trop court', async () => {
      const s = new MarketAnalysisService(fakeHistory({ 'XAU/USD': historyOf('XAU/USD', trending(15, 2000, 0.003)) }));
      expect(((await s.simulate({ symbol: 'DOGE-LAND' })) as any).erreur).toContain('Actif inconnu');
      expect(((await s.simulate({ symbol: 'AAPL' })) as any).erreur).toContain('indisponible');
      expect(((await s.simulate({ symbol: 'XAU/USD' })) as any).erreur).toContain('Pas assez');
      expect(((await s.backtest({ symbol: 'XAU/USD' })) as any).erreur).toContain('Pas assez');
    });
  });
});
