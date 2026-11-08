import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { Profile } from '../../users/profile.entity.js';
import { UserRole } from '../../users/user-role.enum.js';
import type { SessionDataProvider } from '../contract/session-data-provider.js';
import { buy, liveSession } from '../fixtures/live-session.js';
import { LlmError, type LlmProvider } from '../llm/llm-provider.js';
import { StubLlmProvider } from '../llm/stub-llm-provider.js';
import { AgentMemory } from './agent-memory.js';
import { AiGuideService } from './ai-guide.service.js';

const profile = (id: string, role = UserRole.TRADER) => ({ id, role }) as Profile;
const amine = profile('amine');
const sarra = profile('sarra');
const prof = profile('prof', UserRole.GAME_MASTER);

const usage = { create: (d: unknown) => d, save: async (d: unknown) => d };

function build(minute: number, llm: LlmProvider = new StubLlmProvider()) {
  const session = liveSession({
    minute,
    participants: [
      { id: 'amine', displayName: 'Amine', trades: [buy('t1', 5, 35, 2700)] },
      {
        id: 'sarra',
        displayName: 'Sarra',
        trades: [buy('t2', 5, 5, 2700)],
        protections: [{ minute: 5, symbol: 'XAU/USD', stopLoss: 2600, takeProfit: null }],
      },
      { id: 'lina', displayName: 'Lina' },
    ],
  });
  const provider: SessionDataProvider = {
    getSession: async () => session,
    listSessions: async () => [
      { sessionId: session.sessionId, title: 'Test', runs: [1], durationMinutes: 30, symbols: session.symbols, participantIds: ['amine', 'sarra', 'lina'] },
    ],
  };
  return new AiGuideService(usage as never, provider, llm, new AgentMemory());
}

describe('alertes du guide', () => {
  it('ne montre chaque alerte qu’une fois', async () => {
    const service = build(8);
    const first = await service.alerts(amine, {});
    expect(first.alerts.some((a) => a.code === 'no_protection')).toBe(true);
    const second = await service.alerts(amine, {});
    expect(second.alerts).toHaveLength(0);
    expect(second.activeCount).toBeGreaterThan(0);
    const history = await service.alerts(amine, {}, true);
    expect(history.alerts.length).toBeGreaterThan(0);
  });

  it('chaque étudiant a ses propres alertes', async () => {
    const service = build(8);
    const a = await service.alerts(amine, {});
    const s = await service.alerts(sarra, {});
    expect(a.alerts.some((x) => x.code === 'no_protection')).toBe(true);
    expect(s.alerts.some((x) => x.code === 'no_protection')).toBe(false);
  });

  it('refuse quelqu’un qui ne participe pas à la séance', async () => {
    const service = build(8);
    await expect(service.alerts(profile('inconnu'), { sessionId: 'salle-test' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un étudiant ne peut pas viser un autre participant par alias', async () => {
    const service = build(8);
    await expect(service.alerts(amine, { alias: 'etu_02' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('briefing', () => {
  it('donne des objectifs sans révéler les événements à venir', async () => {
    const service = build(1);
    const briefing = await service.briefing(amine, {});
    expect(briefing.first).toBe(true);
    expect(briefing.title).toBe('Le mardi de la panique');
    expect(briefing.objectives.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(briefing)).not.toMatch(/minute 11|minute 22|Fed|Choc/);
    expect((await service.briefing(amine, {})).first).toBe(false);
  });
});

describe('bilan de fin', () => {
  it('sans modèle : texte du code avec points forts et points à retravailler', async () => {
    const service = build(23);
    const debrief = await service.debrief(amine, {});
    expect(debrief.source).toBe('rules');
    expect(debrief.text).toContain('Bilan');
    expect(debrief.toImprove.join(' ')).toContain('Aucune de tes positions n’avait de stop-loss');
  });

  it('retient ce que le coach a déjà signalé', async () => {
    const service = build(23);
    await service.alerts(amine, {});
    const debrief = await service.debrief(sarra, {});
    expect(debrief.strengths.join(' ')).toContain('protégées');
  });

  it('avec un modèle : accepte un texte aux chiffres vérifiés', async () => {
    const llm: LlmProvider = {
      name: 'fake',
      generate: async () => ({ text: 'Ton exposition a atteint 94,5 % de ton capital : pense à te protéger avec un stop-loss.', model: 'm', usage: { inputTokens: 5, outputTokens: 5 } }),
    };
    const service = build(23, llm);
    const debrief = await service.debrief(amine, {});
    expect(debrief.source).toBe('llm');
  });

  it('avec un modèle : refuse un chiffre inventé et retombe sur le texte du code', async () => {
    const llm: LlmProvider = {
      name: 'fake',
      generate: async () => ({ text: 'Tu as gagné 83 % cette séance.', model: 'm', usage: { inputTokens: 5, outputTokens: 5 } }),
    };
    const debrief = await build(23, llm).debrief(amine, {});
    expect(debrief.source).toBe('rules');
    expect(debrief.fallbackReason).toContain('83');
  });

  it('modèle indisponible : texte du code, pas d’erreur', async () => {
    const llm: LlmProvider = { name: 'fake', generate: async () => Promise.reject(new LlmError('HTTP 500', 500)) };
    const debrief = await build(23, llm).debrief(amine, {});
    expect(debrief).toMatchObject({ source: 'rules', fallbackReason: 'Modèle indisponible.' });
  });

  it('limite les demandes répétées', async () => {
    const service = build(23);
    for (let i = 0; i < 3; i += 1) await service.debrief(amine, {});
    await expect(service.debrief(amine, {})).rejects.toBeInstanceOf(HttpException);
  });
});

describe('suivi enseignant en direct', () => {
  it('liste les participants en difficulté en premier, avec un résumé', async () => {
    const live = await build(14).live(prof, {});
    expect(live.rows.map((r) => r.name)).toContain('Amine');
    expect(live.rows[0]!.name).toBe('Amine'); // position énorme sans stop-loss
    expect(live.rows[0]!.status).toBe('alert');
    expect(live.rows.find((r) => r.name === 'Sarra')!.unprotected).toBe(0);
    expect(live.summary.join(' ')).toContain('stop-loss');
    expect(live.summary.join(' ')).toContain('news');
    expect(live.rows.find((r) => r.name === 'Lina')!.tradeCount).toBe(0);
  });

  it('ne signale pas à l’enseignant un choc de marché qui touche toute la classe', async () => {
    const live = await build(23).live(prof, {});
    const sarraRow = live.rows.find((r) => r.name === 'Sarra')!;
    expect(sarraRow.flags).toHaveLength(0);
    expect(sarraRow.status).toBe('ok');
  });

  it('est réservé à l’enseignant', async () => {
    await expect(build(14).live(amine, {})).rejects.toBeInstanceOf(ForbiddenException);
  });
});
