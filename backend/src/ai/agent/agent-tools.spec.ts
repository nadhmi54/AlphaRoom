import { describe, expect, it } from 'vitest';
import { buy, liveSession } from '../fixtures/live-session.js';
import { buildToolbox } from './agent-tools.js';
import { MarketAnalysisService } from '../market/market-analysis.service.js';
import { historyOf, trending } from '../market/test-data.js';

const session = liveSession({
  minute: 14,
  participants: [
    { id: 'a', trades: [buy('t1', 5, 20, 2700)], protections: [{ minute: 5, symbol: 'XAU/USD', stopLoss: 2650, takeProfit: null }] },
    { id: 'b', trades: [buy('t9', 6, 99, 2700)] },
    { id: 'c' },
  ],
});
const toolbox = (participantId = 'a') => buildToolbox({ session, participantId, memory: () => ({ questions_deja_posees: [] }) });

describe('outils de l’agent', () => {
  it('renvoie le portefeuille du trader avec des pourcentages déjà calculés', () => {
    const { data } = toolbox().run('get_portfolio', '{}');
    expect(data.minute).toBe(14);
    expect(data.exposition_pct).toBeCloseTo(53.8, 0);
    expect((data.positions_ouvertes as Array<Record<string, unknown>>)[0]).toMatchObject({ actif: 'XAU/USD', quantite: 20, stop_loss: 2650, protegee: true });
  });

  it('ne montre jamais les ordres d’un autre participant', () => {
    const text = JSON.stringify(toolbox('a').run('get_trades', '{}').data);
    expect(text).toContain('t1');
    expect(text).not.toContain('t9');
    expect(text).not.toContain('99');
  });

  it('ne montre pas le futur : ni la news de la minute 22, ni les prix après la minute 14', () => {
    const tb = toolbox();
    const events = JSON.stringify(tb.run('get_events', '{}').data);
    expect(events).toContain('Fed');
    expect(events).not.toContain('Choc de prix');
    const market = tb.run('get_market', '{"minutes": 15}').data.marches as Array<{ derniers_prix: Array<{ minute: number }> }>;
    expect(Math.max(...market[0]!.derniers_prix.map((p) => p.minute))).toBe(14);
  });

  it('indique si le trader a réagi à la news', () => {
    const events = toolbox().run('get_events', '{}').data.evenements as Array<Record<string, unknown>>;
    expect(events[0]).toMatchObject({ id: 'ev-news', trader_a_reagi: false });
  });

  it('refuse proprement un outil inconnu, des arguments illisibles et un actif inconnu', () => {
    const tb = toolbox();
    expect(tb.run('delete_everything', '{}').data.erreur).toBeDefined();
    expect(tb.run('get_trades', 'pas du json').data.erreur).toBeDefined();
    expect(tb.run('get_market', '{"symbol":"BTC/USD"}').data.erreur).toBeDefined();
  });

  it('borne les arguments du modèle', () => {
    const trades = toolbox().run('get_trades', '{"limit": 100000}').data.ordres as unknown[];
    expect(trades.length).toBeLessThanOrEqual(30);
  });

  it('expose seulement des outils de lecture ou de simulation, jamais d’écriture', () => {
    const names = toolbox().specs.map((s) => s.name);
    expect(names.every((n) => /^(get_|simulate_|position_size|scan_|analyze_)/.test(n))).toBe(true);
    expect(names.some((n) => /order|buy|sell|place|delete|update|set_/.test(n))).toBe(false);
  });

  it('simule un mouvement de prix sur la position', () => {
    const { data } = toolbox().run('simulate_price_move', '{"change_pct": -3}');
    expect(data).toMatchObject({ actif: 'XAU/USD', sens: 'baisse', variation_prix_pct: -3, quantite_detenue: 20, stop_loss_declenche: true }); // 2 599,6 est sous le stop à 2 650
    // 20 oz × 2 680 $ × -3 % = -1 608 $
    expect(data.gain_perte_simule).toBeCloseTo(-1608, 0);
    expect(data.exposition_simulee_pct).toBeLessThan(54);
    // une petite baisse ne touche pas le stop à 2 650
    expect(toolbox().run('simulate_price_move', '{"change_pct": -1}').data.stop_loss_declenche).toBe(false);
  });

  it('garde la précision des actifs à petit prix (EUR/USD, XRP) au lieu d’arrondir à 2 décimales', () => {
    const fx = liveSession({
      minute: 5,
      symbols: ['EUR/USD'],
      priceFor: () => 1.0853,
      participants: [{ id: 'a', trades: [buy('t1', 2, 10_000, 1.0831, 'EUR/USD')] }],
    });
    const tools = buildToolbox({ session: fx, participantId: 'a', memory: () => ({}) });
    const portfolio = tools.run('get_portfolio', '{}').data as { positions_ouvertes: Array<{ prix_actuel: number; prix_moyen: number }> };
    expect(portfolio.positions_ouvertes[0]).toMatchObject({ prix_actuel: 1.0853, prix_moyen: 1.0831 });
    const sim = tools.run('simulate_price_move', '{"change_pct": -1}').data;
    expect(sim.prix_simule).toBeCloseTo(1.07445, 4);
    const size = tools.run('position_size', '{"risk_pct": 1, "stop_price": 1.0803}').data;
    expect(size.perte_par_unite_si_stop).toBeCloseTo(0.005, 4);
  });

  it('simule un prix cible et indique si le stop se déclenche', () => {
    const { data } = toolbox().run('simulate_price_move', '{"target_price": 2600}');
    expect(data.stop_loss_declenche).toBe(true);
    expect(toolbox().run('simulate_price_move', '{}').data.erreur).toBeDefined();
  });

  it('simule un stop-loss : distance, perte et part du portefeuille', () => {
    const { data } = toolbox().run('simulate_stop_loss', '{"stop_price": 2650}');
    expect(data).toMatchObject({ prix_actuel: 2680, stop_propose: 2650, quantite: 20 });
    expect(data.distance_au_prix_pct).toBeCloseTo(1.12, 2);
    expect(data.perte_depuis_maintenant_si_declenche).toBeCloseTo(-600, 0);
    expect(toolbox().run('simulate_stop_loss', '{"stop_price": 2900}').data.erreur).toContain('sous le prix actuel');
  });

  it('calcule la taille de position pour un risque donné, limitée par le cash', () => {
    const { data } = toolbox().run('position_size', '{"risk_pct": 0.5, "stop_price": 2650}');
    expect(data.perte_par_unite_si_stop).toBe(30);
    expect(data.quantite_theorique).toBeCloseTo(16.6, 0);
    expect(data.limite_par_le_cash).toBe(false);
    // 1 % de risque donnerait 33 oz, mais il ne reste du cash que pour 17 oz
    expect(toolbox().run('position_size', '{"risk_pct": 1, "stop_price": 2650}').data.limite_par_le_cash).toBe(true);
    const tight = toolbox().run('position_size', '{"risk_pct": 50, "stop_price": 2679}').data;
    expect(tight.limite_par_le_cash).toBe(true);
    expect(toolbox().run('position_size', '{"risk_pct": 0, "stop_price": 2650}').data.erreur).toBeDefined();
  });

  it('les simulations n’ont rien à simuler sans position', () => {
    const none = buildToolbox({ session, participantId: 'c', memory: () => ({}) });
    expect(none.run('simulate_price_move', '{"change_pct": -3}').data.erreur).toBeDefined();
  });

  it('fournit les points de vigilance et la mémoire', () => {
    const tb = toolbox();
    expect(JSON.stringify(tb.run('get_risk_review', '{}').data)).toContain('news_no_reaction');
    expect(tb.run('get_memory', '{}').data).toHaveProperty('questions_deja_posees');
  });

  describe('outils d’analyse de marché', () => {
    const market = new MarketAnalysisService({
      get: async (symbol: string) => (symbol === 'XAU/USD' ? historyOf('XAU/USD', trending(90, 2000, 0.003)) : null),
      getMany: async (symbols: string[]) => symbols.map((symbol) => (symbol === 'XAU/USD' ? historyOf('XAU/USD', trending(90, 2000, 0.003)) : null)),
    } as never);
    const withMarket = () => buildToolbox({ session, participantId: 'a', memory: () => ({}), market });

    it('ne les propose que si le module de marché est branché', () => {
      expect(toolbox().specs.map((s) => s.name)).not.toContain('scan_markets');
      expect(withMarket().specs.map((s) => s.name)).toEqual(expect.arrayContaining(['scan_markets', 'analyze_asset']));
    });

    it('les exécute en asynchrone et garde les outils instantanés', async () => {
      const tools = withMarket();
      const scan = await tools.runAsync('scan_markets', '{"horizon":"mois"}');
      expect((scan.data as { marches: unknown[] }).marches).toHaveLength(1);
      const analysis = await tools.runAsync('analyze_asset', '{"symbol":"XAU/USD"}');
      expect(analysis.data).toMatchObject({ actif: 'XAU/USD', tendance: 'haussière' });
      expect((await tools.runAsync('get_session_info', '{}')).data).toHaveProperty('minute_actuelle');
    });

    it('simule le risque avec la VRAIE position du trader, que le modèle ne peut pas falsifier', async () => {
      const tools = withMarket();
      expect(tools.specs.map((s) => s.name)).toEqual(expect.arrayContaining(['simulate_outcomes', 'backtest_signal']));
      const out = (await tools.runAsync('simulate_outcomes', JSON.stringify({ symbol: 'XAU/USD', jours: 5, stop_pct: 2, position_value: 999999999, portfolioTotal: 1 }))).data as any;
      // 20 XAU à 2 680 $ = 53 600 $ : la valeur vient du serveur, pas des arguments du modèle.
      expect(out.ta_position.valeur).toBeCloseTo(53600, 0);
      expect(out.ta_position.part_du_portefeuille_pct).toBeGreaterThan(53);
      expect(out.ta_position.part_du_portefeuille_pct).toBeLessThan(54.5);
      const noPosition = (await tools.runAsync('simulate_outcomes', '{"symbol":"EUR/USD"}')).data as any;
      expect(noPosition.ta_position).toBeUndefined();
    });

    it('backteste un signal via le module de marché', async () => {
      const out = (await withMarket().runAsync('backtest_signal', '{"symbol":"XAU/USD","jours_apres":3}')).data as any;
      expect(out.horizon_apres_signal_jours).toBe(3);
    });

    it('rend une erreur lisible quand les arguments sont illisibles ou le module plante', async () => {
      expect(((await withMarket().runAsync('analyze_asset', '{pas du json')).data as { erreur: string }).erreur).toContain('illisibles');
      const broken = buildToolbox({ session, participantId: 'a', memory: () => ({}), market: { scan: async () => { throw new Error('boom'); }, analyze: async () => ({}), simulate: async () => ({}), backtest: async () => ({}) } });
      expect(((await broken.runAsync('scan_markets', '{}')).data as { erreur: string }).erreur).toContain('indisponible');
      expect(((await withMarket().runAsync('outil_inventé', '{}')).data as { erreur: string }).erreur).toContain('inconnu');
    });
  });
});
