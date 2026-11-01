import { describe, expect, it } from 'vitest';
import { UserRole } from '../../users/user-role.enum.js';
import { buildPanicTuesday } from '../fixtures/panic-tuesday.js';
import {
  AiAccessError,
  buildGroupContext,
  buildParticipantContext,
  participantAlias,
  resolveAlias,
} from './ai-context.js';
import { hashValue, stableStringify } from './stable-json.js';

const session = buildPanicTuesday();
const trader = (id: string) => ({ id, role: UserRole.TRADER });
const teacher = { id: 'prof', role: UserRole.GAME_MASTER };

describe('droits d’accès', () => {
  it('un trader voit ses propres données', () => {
    const ctx = buildParticipantContext(session, 'user-sarra', trader('user-sarra'));
    expect(ctx.participant.pnl.value).toBe(-200);
  });

  it('un trader ne peut pas voir un autre étudiant', () => {
    expect(() => buildParticipantContext(session, 'user-amine', trader('user-sarra'))).toThrow(AiAccessError);
  });

  it('un trader ne peut pas demander la synthèse du groupe', () => {
    expect(() => buildGroupContext(session, trader('user-sarra'))).toThrow(AiAccessError);
  });

  it('un game master et un admin voient le groupe et chaque étudiant', () => {
    expect(buildGroupContext(session, teacher).participants).toHaveLength(4);
    expect(buildGroupContext(session, { id: 'a', role: UserRole.ADMIN }).participants).toHaveLength(4);
    expect(buildParticipantContext(session, 'user-amine', teacher).participant.maxExposure.value).toBe(0.918);
  });

  it('refuse un participant absent de la séance', () => {
    expect(() => buildParticipantContext(session, 'inconnu', teacher)).toThrow(AiAccessError);
  });
});

describe('confidentialité', () => {
  const payloads = [
    JSON.stringify(buildParticipantContext(session, 'user-sarra', trader('user-sarra'))),
    JSON.stringify(buildGroupContext(session, teacher)),
  ];

  it('ne contient aucun identifiant interne ni aucun nom', () => {
    for (const json of payloads) {
      for (const p of session.participants) {
        expect(json).not.toContain(p.id);
        expect(json).not.toContain(p.displayName);
      }
    }
  });

  it('identifie les participants par des alias stables', () => {
    expect(participantAlias(session, 'user-amine')).toBe('etu_01');
    expect(participantAlias(session, 'user-sarra')).toBe('etu_04');
    expect(resolveAlias(session, 'etu_04')).toBe('user-sarra');
    expect(resolveAlias(session, 'etu_99')).toBeUndefined();
  });
});

describe('contenu et limites', () => {
  it('résume les prix et place les prix aux minutes des événements', () => {
    const ctx = buildParticipantContext(session, 'user-sarra', trader('user-sarra'));
    expect(ctx.priceSummary[0]).toMatchObject({ symbol: 'XAU/USD', first: 2700, last: 2640, min: 2619, minMinute: 22 });
    expect(ctx.events.find((e) => e.id === 'ev-shock')?.prices['XAU/USD']).toBe(2619);
  });

  it('tronque les exécutions les plus anciennes et le signale', () => {
    const ctx = buildParticipantContext(session, 'user-karim', teacher, { maxTrades: 2 });
    expect(ctx.trades.map((t) => t.id)).toEqual(['k3', 'k4']);
    expect(ctx.tradesTruncated).toBe(true);
  });

  it('nettoie les textes d’événements saisis par un humain', () => {
    const dirty = {
      ...session,
      events: [{ id: 'e', minute: 1, type: 'news' as const, label: `Alerte\n\u0000 ${'x'.repeat(300)}` }],
    };
    const label = buildGroupContext(dirty, teacher).events[0]!.label;
    expect([...label].some((c) => c.charCodeAt(0) < 32)).toBe(false);
    expect(label.length).toBeLessThanOrEqual(201);
  });

  it('transmet les données manquantes plutôt que de les cacher', () => {
    const ctx = buildParticipantContext(session, 'user-lina', teacher);
    expect(ctx.participant.missingData).toContain('no_trades');
  });
});

describe('empreinte', () => {
  it('est identique quel que soit l’ordre des clés', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
    expect(hashValue({ a: 1, b: 2 })).toBe(hashValue({ b: 2, a: 1 }));
  });

  it('change quand une donnée change', () => {
    const a = buildParticipantContext(session, 'user-sarra', teacher);
    const b = buildParticipantContext(buildPanicTuesday(2), 'user-sarra', teacher);
    expect(hashValue(a)).not.toBe(hashValue(b));
  });
});
