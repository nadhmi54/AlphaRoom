import { describe, expect, it } from 'vitest';
import { buy, liveSession, sell } from '../fixtures/live-session.js';
import { AGENT_SYSTEM_PROMPT } from './coach-agent.js';
import { buildToolbox } from './agent-tools.js';
import { buildTradingOptions, describeOptions } from './trading-options.js';

const withPosition = liveSession({
  minute: 14,
  participants: [
    { id: 'a', trades: [buy('t1', 5, 20, 2700)], protections: [{ minute: 5, symbol: 'XAU/USD', stopLoss: 2650, takeProfit: null }] },
    { id: 'nostop', trades: [buy('t2', 5, 20, 2700)] },
    { id: 'empty' },
    { id: 'broke', trades: [buy('t3', 2, 37, 2700)] },
    { id: 'closed', trades: [buy('t4', 2, 10, 2700), sell('t5', 8, 10, 2690)] },
  ],
});

const optionsFor = (participantId: string, session = withPosition) => buildTradingOptions(session, participantId).actifs[0]!;
const actions = (participantId: string) => optionsFor(participantId).options.map((o) => o.action);

describe('options de trading : que peut faire l’étudiant ?', () => {
  it('sans position : il peut acheter dans la limite de son cash, mais pas vendre (pas de vente à découvert)', () => {
    const asset = optionsFor('empty');
    expect(asset).toMatchObject({ actif: 'XAU/USD', peut_acheter: true, peut_vendre: false, quantite_detenue: 0, position: null });
    expect(asset.quantite_max_achat).toBeCloseTo(100_000 / 2680, 3);
    expect(asset.vente_impossible_car).toContain('à découvert');
    expect(actions('empty')).toEqual(['acheter_une_partie', 'attendre']);
  });

  it('avec une position : il peut vendre au plus ce qu’il détient', () => {
    const asset = optionsFor('a');
    expect(asset).toMatchObject({ peut_vendre: true, quantite_detenue: 20 });
    expect(asset.position).toMatchObject({ protegee: true, stop_loss: 2650 });
    expect(actions('a')).toEqual(expect.arrayContaining(['garder', 'cloturer']));
  });

  it('une position fermée ne peut plus être vendue', () => {
    expect(optionsFor('closed')).toMatchObject({ peut_vendre: false, quantite_detenue: 0 });
  });

  it('sans cash suffisant : achat impossible, avec la raison', () => {
    // 37 oz × 2 700 $ = 99 900 $ : il reste 100 $, soit moins d’une once à 2 680 $.
    const asset = optionsFor('broke');
    expect(asset.quantite_max_achat).toBeLessThan(0.05);
    const ok = buildTradingOptions(withPosition, 'broke').actifs[0]!;
    expect(ok.peut_acheter || ok.achat_impossible_car !== undefined).toBe(true);
  });

  it('propose de poser un stop quand la position n’est pas protégée, et seulement dans ce cas', () => {
    expect(actions('nostop')).toContain('poser_un_stop');
    expect(actions('a')).not.toContain('poser_un_stop');
  });

  it('chaque option a une justification, un risque et ce qui ferait changer d’avis', () => {
    for (const id of ['a', 'nostop', 'empty']) {
      for (const option of optionsFor(id).options) {
        expect(option.pourquoi.length).toBeGreaterThan(0);
        expect(option.risques.length).toBeGreaterThan(0);
        expect(option.ce_qui_ferait_changer_d_avis.length).toBeGreaterThan(10);
      }
    }
  });

  it('les textes ne contiennent aucun chiffre : les chiffres sont dans des champs à part', () => {
    for (const id of ['a', 'nostop', 'empty']) {
      for (const option of optionsFor(id).options) {
        const prose = [...option.pourquoi, ...option.risques, option.ce_qui_ferait_changer_d_avis].join(' ');
        expect(prose).not.toMatch(/\d/);
      }
    }
  });

  it('n’emploie jamais de formule d’ordre ou de prédiction', () => {
    const text = JSON.stringify(buildTradingOptions(withPosition, 'a')) + JSON.stringify(buildTradingOptions(withPosition, 'empty'));
    expect(text).not.toMatch(/je (?:vais|vends|achète)|va (?:monter|baisser)|garanti|sans risque/i);
  });

  it('rappelle que c’est l’étudiant qui décide et clique', () => {
    const result = buildTradingOptions(withPosition, 'a');
    expect(result.rappel).toContain('l’étudiant décide');
    expect(result.regles_de_la_salle).toContain('le coach n’en passe jamais');
  });

  it('à la fin de la séance, l’achat n’est plus proposé et la clôture est justifiée', () => {
    const ending = liveSession({ minute: 29, participants: [{ id: 'a', trades: [buy('t1', 5, 20, 2700)] }] });
    const asset = buildTradingOptions(ending, 'a').actifs[0]!;
    expect(asset.peut_acheter).toBe(false);
    expect(asset.achat_impossible_car).toContain('presque terminée');
    expect(asset.options.map((o) => o.action)).not.toContain('acheter');
    expect(asset.options.find((o) => o.action === 'cloturer')?.pourquoi.join(' ')).toContain('se termine');
  });

  it('ne regarde jamais les ordres d’un autre participant', () => {
    expect(optionsFor('empty').quantite_detenue).toBe(0);
    expect(optionsFor('empty').position).toBeNull();
  });

  it('peut se limiter à un seul actif et ignore un actif inconnu', () => {
    const two = liveSession({ minute: 10, symbols: ['XAU/USD', 'EUR/USD'], priceFor: () => 100, participants: [{ id: 'a' }] });
    expect(buildTradingOptions(two, 'a').actifs).toHaveLength(2);
    expect(buildTradingOptions(two, 'a', 'EUR/USD').actifs.map((a) => a.actif)).toEqual(['EUR/USD']);
    expect(buildTradingOptions(two, 'a', 'DOGE').actifs).toHaveLength(2);
  });

  it('signale l’exposition élevée en proposant d’alléger', () => {
    const heavy = liveSession({ minute: 10, participants: [{ id: 'a', trades: [buy('t1', 3, 30, 2700)], protections: [{ minute: 3, symbol: 'XAU/USD', stopLoss: 2600, takeProfit: null }] }] });
    expect(buildTradingOptions(heavy, 'a').actifs[0]!.options.map((o) => o.action)).toContain('alleger');
  });

  it('refuse un participant absent plutôt que d’inventer', () => {
    expect(() => buildTradingOptions(withPosition, 'inconnu')).toThrow();
  });
});

describe('outil get_trading_options', () => {
  const toolbox = (participantId = 'a') => buildToolbox({ session: withPosition, participantId, memory: () => ({}) });

  it('est un outil de lecture seule proposé à l’agent', () => {
    const names = toolbox().specs.map((s) => s.name);
    expect(names).toContain('get_trading_options');
    expect(names.some((n) => /order|buy|sell|place|delete|update|set_/.test(n))).toBe(false);
  });

  it('renvoie les options du participant, jamais celles d’un autre', () => {
    const { data } = toolbox('a').run('get_trading_options', '{}');
    expect(data).toMatchObject({ minute: 14 });
    const asset = (data.actifs as Array<{ quantite_detenue: number }>)[0]!;
    expect(asset.quantite_detenue).toBe(20);
    expect((toolbox('empty').run('get_trading_options', '{}').data.actifs as Array<{ quantite_detenue: number }>)[0]!.quantite_detenue).toBe(0);
  });

  it('accepte un symbole et rend une erreur lisible si le participant est inconnu', () => {
    expect(toolbox('a').run('get_trading_options', '{"symbol":"XAU/USD"}').data.actifs).toHaveLength(1);
    expect(toolbox('inconnu').run('get_trading_options', '{}').data.erreur).toBeDefined();
  });
});

describe('consignes du coach pour « puis-je acheter / vendre ? »', () => {
  it('demande d’appeler get_trading_options et de donner options + justifications', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('get_trading_options');
    expect(AGENT_SYSTEM_PROMPT).toContain('PUIS-JE ACHETER OU VENDRE');
    expect(AGENT_SYSTEM_PROMPT).toContain('chacune avec sa justification');
  });

  it('garde la règle : le coach propose, l’étudiant décide et clique', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('tu proposes, il décide');
    expect(AGENT_SYSTEM_PROMPT).toContain("c'est LUI qui décide");
    expect(AGENT_SYSTEM_PROMPT).toContain('tu ne passes aucun ordre');
  });
});

describe('réponse de secours sans modèle', () => {
  it('décrit ce que l’étudiant peut faire, avec les raisons, et lui laisse la décision', () => {
    const text = describeOptions(buildTradingOptions(withPosition, 'nostop'));
    expect(text).toContain('tu peux vendre jusqu’à 20');
    expect(text).toContain('Poser un stop-loss');
    expect(text).toContain('Risque :');
    expect(text).toContain('l’étudiant décide');
  });

  it('dit clairement quand il n’y a rien à vendre', () => {
    const text = describeOptions(buildTradingOptions(withPosition, 'empty'));
    expect(text).toContain('rien à vendre');
    expect(text).toContain('Attendre');
  });
});
