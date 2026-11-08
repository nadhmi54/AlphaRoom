import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { AiCoreModule, createSessionDataProvider } from './ai.module.js';
import {
  SESSION_DATA_PROVIDER,
  SessionNotFoundError,
  SessionSourceUnavailableError,
  type SessionDataProvider,
} from './contract/session-data-provider.js';
import { LLM_PROVIDER, type LlmProvider } from './llm/llm-provider.js';

async function core(env: Record<string, string>) {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }), AiCoreModule],
  }).compile();
  return {
    llm: moduleRef.get<LlmProvider>(LLM_PROVIDER),
    sessions: moduleRef.get<SessionDataProvider>(SESSION_DATA_PROVIDER),
  };
}

describe('AiCoreModule', () => {
  it('fournit le stub et une source non branchée quand rien n’est configuré', async () => {
    const { llm, sessions } = await core({});
    expect(llm.name).toBe('stub');
    await expect(sessions.getSession('x', 1)).rejects.toBeInstanceOf(SessionSourceUnavailableError);
  });

  it('fournit Anthropic quand la configuration est complète', async () => {
    const { llm } = await core({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', AI_MODEL: 'm' });
    expect(llm.name).toBe('anthropic');
  });

  it('échoue au démarrage si la clé manque', async () => {
    await expect(core({ AI_PROVIDER: 'anthropic', AI_MODEL: 'm' })).rejects.toThrow('ANTHROPIC_API_KEY');
  });

  it('propose la séance fictive en mode demo', async () => {
    const { sessions } = await core({ AI_SESSION_SOURCE: 'demo' });
    expect((await sessions.getSession('mardi-panique', 1)).participants).toHaveLength(4);
    expect((await sessions.getSession('mardi-panique', 2)).run).toBe(2);
    await expect(sessions.getSession('mardi-panique', 3)).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('rattache un vrai compte à l’étudiant fictif quand AI_DEMO_STUDENT_ID est défini', async () => {
    const { sessions } = await core({ AI_SESSION_SOURCE: 'demo', AI_DEMO_STUDENT_ID: 'abc' });
    expect((await sessions.getSession('mardi-panique', 1)).participants.some((p) => p.id === 'abc')).toBe(true);
  });
});

describe('createSessionDataProvider', () => {
  it('ignore toute valeur inconnue : la simulation reste non branchée', async () => {
    await expect(createSessionDataProvider('autre').getSession('a', 1)).rejects.toBeInstanceOf(SessionSourceUnavailableError);
  });

  it('« game-room » délègue au fournisseur de la Game Room, résolu à l’appel', async () => {
    const fake = {
      getSession: async (id: string, run: number) => ({ sessionId: id, run }) as never,
      listSessions: async () => [{ sessionId: 'r1', title: 'Salle', runs: [1], durationMinutes: 30, symbols: [], participantIds: [] }],
    };
    const resolve = vi.fn(() => fake);
    const provider = createSessionDataProvider('game-room', undefined, resolve);
    expect(resolve).not.toHaveBeenCalled();
    expect(await provider.getSession('r1', 1)).toMatchObject({ sessionId: 'r1', run: 1 });
    expect((await provider.listSessions!())[0]!.sessionId).toBe('r1');
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('« game-room » sans fournisseur reste non branché', async () => {
    await expect(createSessionDataProvider('game-room').getSession('a', 1)).rejects.toBeInstanceOf(SessionSourceUnavailableError);
  });
});
