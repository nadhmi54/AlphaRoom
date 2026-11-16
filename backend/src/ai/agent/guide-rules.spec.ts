import { describe, expect, it } from 'vitest';
import { buy, liveSession, sell } from '../fixtures/live-session.js';
import { evaluateGuide } from './guide-rules.js';

const codes = (alerts: Array<{ code: string }>) => alerts.map((a) => a.code);

describe('guide pédagogique', () => {
  it('signale une position sans stop-loss, avec les chiffres du trader', () => {
    const session = liveSession({ minute: 8, participants: [{ id: 'a', trades: [buy('t1', 5, 20, 2700)] }] });
    const alert = evaluateGuide(session, 'a').find((x) => x.code === 'no_protection');
    expect(alert).toBeDefined();
    expect(alert!.message).toContain('20 XAU/USD');
    expect(alert!.message).toContain('stop-loss');
    expect(alert!.severity).toBe('alert'); // 54 % du portefeuille
  });

  it('ne signale plus rien quand la position est protégée', () => {
    const session = liveSession({
      minute: 8,
      participants: [{ id: 'a', trades: [buy('t1', 5, 20, 2700)], protections: [{ minute: 5, symbol: 'XAU/USD', stopLoss: 2650, takeProfit: null }] }],
    });
    expect(codes(evaluateGuide(session, 'a'))).not.toContain('no_protection');
  });

  it('attend une minute avant de réclamer le stop-loss', () => {
    const session = liveSession({ minute: 5, participants: [{ id: 'a', trades: [buy('t1', 5, 5, 2700)] }] });
    expect(codes(evaluateGuide(session, 'a'))).not.toContain('no_protection');
  });

  it('prévient d’une news dès son arrivée, sans jamais voir celles du futur', () => {
    const before = liveSession({ minute: 9, participants: [{ id: 'a' }] });
    expect(codes(evaluateGuide(before, 'a'))).not.toContain('news_fresh');
    const after = liveSession({ minute: 11, participants: [{ id: 'a' }] });
    const news = evaluateGuide(after, 'a').find((x) => x.code === 'news_fresh');
    expect(news?.message).toContain('Fed');
    expect(JSON.stringify(evaluateGuide(after, 'a'))).not.toContain('Choc de prix');
  });

  it('relève l’absence de réaction à la news quand le trader a une position', () => {
    const session = liveSession({ minute: 14, participants: [{ id: 'a', trades: [buy('t1', 6, 5, 2700)], protections: [{ minute: 6, symbol: 'XAU/USD', stopLoss: 2600, takeProfit: null }] }] });
    const alert = evaluateGuide(session, 'a').find((x) => x.code === 'news_no_reaction');
    expect(alert?.message).toContain('minute 11');
    const reacted = liveSession({
      minute: 14,
      participants: [{ id: 'a', trades: [buy('t1', 6, 5, 2700), sell('t2', 12, 2, 2680)], protections: [{ minute: 6, symbol: 'XAU/USD', stopLoss: 2600, takeProfit: null }] }],
    });
    expect(codes(evaluateGuide(reacted, 'a'))).not.toContain('news_no_reaction');
  });

  it('signale un mouvement brusque et son effet sur la position', () => {
    const session = liveSession({ minute: 23, participants: [{ id: 'a', trades: [buy('t1', 5, 20, 2700)], protections: [{ minute: 5, symbol: 'XAU/USD', stopLoss: 2000, takeProfit: null }] }] });
    const alert = evaluateGuide(session, 'a').find((x) => x.code === 'sharp_move');
    expect(alert?.severity).toBe('alert');
    expect(alert?.message).toContain('de perte');
  });

  it('signale la baisse du portefeuille et l’exposition élevée', () => {
    const session = liveSession({ minute: 23, participants: [{ id: 'a', trades: [buy('t1', 5, 35, 2700)] }] });
    const list = codes(evaluateGuide(session, 'a'));
    expect(list).toContain('high_exposure');
    expect(list).toContain('drawdown');
  });

  it('invite à passer un premier ordre', () => {
    const session = liveSession({ minute: 6, participants: [{ id: 'a' }] });
    expect(codes(evaluateGuide(session, 'a'))).toContain('idle');
    expect(codes(evaluateGuide(liveSession({ minute: 2, participants: [{ id: 'a' }] }), 'a'))).not.toContain('idle');
  });

  it('constate un stop-loss déclenché', () => {
    const session = liveSession({
      minute: 24,
      participants: [
        {
          id: 'a',
          trades: [buy('t1', 5, 10, 2700), sell('t2', 23, 10, 2619)],
          protections: [{ minute: 5, symbol: 'XAU/USD', stopLoss: 2650, takeProfit: null }],
        },
      ],
    });
    expect(codes(evaluateGuide(session, 'a'))).toContain('stop_triggered');
  });

  it('ne dit jamais d’acheter ou de vendre', () => {
    const session = liveSession({ minute: 23, participants: [{ id: 'a', trades: [buy('t1', 5, 35, 2700)] }] });
    const text = evaluateGuide(session, 'a').map((a) => a.message).join(' ');
    expect(text).not.toMatch(/\b(achète|achetez|vends|vendez)\b/i);
  });

  it('les identifiants sont stables : même situation, même alerte', () => {
    const a = liveSession({ minute: 8, participants: [{ id: 'a', trades: [buy('t1', 5, 20, 2700)] }] });
    const b = liveSession({ minute: 8, participants: [{ id: 'a', trades: [buy('t1', 5, 20, 2700)] }] });
    expect(evaluateGuide(a, 'a').map((x) => x.id)).toEqual(evaluateGuide(b, 'a').map((x) => x.id));
  });
});
