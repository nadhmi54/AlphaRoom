import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { Profile } from '../../users/profile.entity.js';
import { UserRole } from '../../users/user-role.enum.js';
import { UnconfiguredSessionDataProvider } from '../contract/session-data-provider.js';
import { createDemoProvider } from '../demo/demo-provider.js';
import type { LlmProvider, LlmRequest } from '../llm/llm-provider.js';
import { StubLlmProvider } from '../llm/stub-llm-provider.js';
import { AiAnalysisService } from './ai-analysis.service.js';

const teacher = { id: 'prof', role: UserRole.GAME_MASTER } as Profile;
const trader = { id: 'user-amine', role: UserRole.TRADER } as Profile;

const usage = { rows: [] as unknown[], create: (d: unknown) => d, async save(r: unknown) { this.rows.push(r); return r; } };

function fakeLlm(text: string) {
  const calls: LlmRequest[] = [];
  const llm: LlmProvider = {
    name: 'fake',
    async generate(req) {
      calls.push(req);
      return { text, model: 'fake-1', usage: { inputTokens: 50, outputTokens: 20 } };
    },
  };
  return { llm, calls };
}

const build = (llm: LlmProvider = new StubLlmProvider(), sessions = createDemoProvider()) => {
  usage.rows = [];
  return new AiAnalysisService(usage as never, sessions, llm);
};

describe('analyses enseignant', () => {
  it('réservées à l’enseignant', async () => {
    const service = build();
    await expect(service.market(trader, { sessionId: 'mardi-panique', run: 1 })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.replay(trader, { sessionId: 'mardi-panique', fromRun: 1, toRun: 2 })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('analyse de marché sans modèle : chiffres du code, pas de commentaire', async () => {
    const result = await build().market(teacher, { sessionId: 'mardi-panique', run: 1 });
    expect(result.analysis.symbols[0]!.symbol).toBe('XAU/USD');
    expect(result.commentary).toBeNull();
    expect(result.commentarySource).toBe('none');
    expect(usage.rows).toHaveLength(0);
  });

  it('replay : compare deux passages', async () => {
    const result = await build().replay(teacher, { sessionId: 'mardi-panique', fromRun: 1, toRun: 2 });
    expect(result.analysis.summary.improved).toBe(1);
    expect(result.analysis.participants.find((p) => p.alias === 'etu_01')?.displayName).toBe('Amine B.');
  });

  it('replay : le passage de départ doit précéder celui d’arrivée', async () => {
    await expect(build().replay(teacher, { sessionId: 'mardi-panique', fromRun: 2, toRun: 1 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('commentaire du modèle accepté et consommation enregistrée', async () => {
    const { llm } = fakeLlm('Un étudiant a nettement réduit son exposition entre les deux passages.');
    const result = await build(llm).replay(teacher, { sessionId: 'mardi-panique', fromRun: 1, toRun: 2 });
    expect(result.commentarySource).toBe('llm');
    expect(usage.rows).toEqual([expect.objectContaining({ purpose: 'replay', inputTokens: 50 })]);
  });

  it('le modèle ne voit ni noms ni identifiants', async () => {
    const { llm, calls } = fakeLlm('Résumé.');
    await build(llm).replay(teacher, { sessionId: 'mardi-panique', fromRun: 1, toRun: 2 });
    const sent = JSON.stringify(calls[0]);
    expect(sent).toContain('etu_01');
    for (const secret of ['Amine', 'Sarra', 'Karim', 'Lina', 'user-amine', 'user-sarra']) expect(sent).not.toContain(secret);
  });

  it('commentaire avec un chiffre inventé : refusé, l’analyse reste disponible', async () => {
    const { llm } = fakeLlm('Le marché a chuté de 40 %.');
    const result = await build(llm).market(teacher, { sessionId: 'mardi-panique', run: 1 });
    expect(result.commentary).toBeNull();
    expect(result.commentaryNote).toContain('refusé');
    expect(result.analysis.highlights.length).toBeGreaterThan(0);
  });

  it('séance inconnue → 404, source non branchée → 503', async () => {
    await expect(build().market(teacher, { sessionId: 'nope', run: 1 })).rejects.toBeInstanceOf(NotFoundException);
    const service = build(new StubLlmProvider(), new UnconfiguredSessionDataProvider() as never);
    await expect(service.market(teacher, { sessionId: 'x', run: 1 })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
