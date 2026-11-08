import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { LlmProvider, LlmRequest } from '../llm/llm-provider.js';
import { MAX_CONVERSATIONS, MAX_MESSAGES, SUMMARY_KEEP, SUMMARY_TRIGGER, titleFrom } from './ai-conversations.service.js';
import { buildConversationStore } from './conversation-fixtures.js';

const ALICE = 'alice';
const BOB = 'bob';

const pair = (i: number) => [
  { role: 'user' as const, content: `question ${i}` },
  { role: 'assistant' as const, content: `réponse ${i}` },
];

async function fill(store: ReturnType<typeof buildConversationStore>, id: string, pairs: number) {
  for (let i = 1; i <= pairs; i += 1) await store.service.append(ALICE, id, pair(i));
}

function summarizer(text = '- résumé de la discussion'): LlmProvider & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  return {
    name: 'fake',
    calls,
    async generate(req) {
      calls.push(req);
      return { text, model: 'fake-1', usage: { inputTokens: 50, outputTokens: 20 } };
    },
  };
}

describe('discussions du coach', () => {
  it('le titre vient du début de la première question', () => {
    expect(titleFrom('  Quel   marché ?  ')).toBe('Quel marché ?');
    expect(titleFrom('x'.repeat(100))).toHaveLength(60);
    expect(titleFrom('x'.repeat(100)).endsWith('…')).toBe(true);
    expect(titleFrom('   ')).toBe('Nouvelle discussion');
  });

  it('crée, liste (la plus récente d’abord) et ne montre que les discussions de la personne', async () => {
    const store = buildConversationStore();
    const a = await store.service.create(ALICE, { title: 'Première', sessionId: 'salle-1' });
    const b = await store.service.create(ALICE, { title: 'Seconde' });
    await store.service.create(BOB, { title: 'Celle de Bob' });
    await store.service.append(ALICE, a.id, pair(1)); // la première redevient la plus récente
    const list = await store.service.list(ALICE);
    expect(list.map((c) => c.title)).toEqual(['Première', 'Seconde']);
    expect(list[0]).toMatchObject({ sessionId: 'salle-1', messageCount: 2 });
    expect(b.sessionId).toBeNull();
    expect((await store.service.list(BOB)).map((c) => c.title)).toEqual(['Celle de Bob']);
  });

  it('une discussion d’un autre est introuvable : lecture, historique, renommage, ajout, suppression', async () => {
    const store = buildConversationStore();
    const mine = await store.service.create(ALICE, { title: 'Privée' });
    await expect(store.service.get(BOB, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(store.service.history(BOB, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(store.service.rename(BOB, mine.id, 'piratée')).rejects.toBeInstanceOf(NotFoundException);
    await expect(store.service.append(BOB, mine.id, pair(1))).rejects.toBeInstanceOf(NotFoundException);
    await expect(store.service.remove(BOB, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await store.service.get(ALICE, mine.id)).conversation.title).toBe('Privée');
  });

  it('renomme (titre nettoyé, jamais vide) et supprime avec ses messages', async () => {
    const store = buildConversationStore();
    const c = await store.service.create(ALICE, { title: 'Ancien' });
    await store.service.append(ALICE, c.id, pair(1));
    expect((await store.service.rename(ALICE, c.id, '  Plan   du jour ')).title).toBe('Plan du jour');
    await expect(store.service.rename(ALICE, c.id, '   ')).rejects.toBeInstanceOf(BadRequestException);
    await store.service.remove(ALICE, c.id);
    expect(store.conversations.rows).toHaveLength(0);
    expect(store.messages.rows).toHaveLength(0);
  });

  it('relit les messages dans l’ordre, avec leurs métadonnées', async () => {
    const store = buildConversationStore();
    const c = await store.service.create(ALICE, { title: 't' });
    await store.service.append(ALICE, c.id, [
      { role: 'user', content: 'Quel marché ?' },
      { role: 'assistant', content: 'La crypto.', meta: { toolsUsed: ['scan_markets'], source: 'llm' } },
    ]);
    const { messages, conversation } = await store.service.get(ALICE, c.id);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1]!.meta).toEqual({ toolsUsed: ['scan_markets'], source: 'llm' });
    expect(conversation.messageCount).toBe(2);
  });

  it('l’historique donné au coach = résumé + messages non résumés', async () => {
    const store = buildConversationStore();
    const c = await store.service.create(ALICE, { title: 't' });
    await fill(store, c.id, 3);
    const fresh = await store.service.history(ALICE, c.id);
    expect(fresh.summary).toBeNull();
    expect(fresh.messages).toHaveLength(6);
    expect(fresh.messages[0]).toEqual({ role: 'user', content: 'question 1' });

    const row = store.conversations.rows[0]!;
    row.summary = '- il a parlé de l’or';
    row.summarizedCount = 4;
    const later = await store.service.history(ALICE, c.id);
    expect(later.summary).toBe('- il a parlé de l’or');
    expect(later.messages.map((m) => m.content)).toEqual(['question 3', 'réponse 3']);
  });

  it('refuse de continuer une discussion démesurée', async () => {
    const store = buildConversationStore();
    const c = await store.service.create(ALICE, { title: 't' });
    store.conversations.rows[0]!.messageCount = MAX_MESSAGES;
    await expect(store.service.history(ALICE, c.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('résume les anciens messages quand la discussion s’allonge, en gardant les récents', async () => {
    const store = buildConversationStore();
    const c = await store.service.create(ALICE, { title: 't' });
    await fill(store, c.id, SUMMARY_TRIGGER / 2); // exactement au seuil : rien à faire
    const llm = summarizer();
    expect(await store.service.summarizeIfNeeded(ALICE, c.id, llm)).toBeNull();
    expect(llm.calls).toHaveLength(0);

    await fill(store, c.id, 8); // 36 + 16 = 52 messages
    const used = await store.service.summarizeIfNeeded(ALICE, c.id, llm);
    expect(used).toMatchObject({ model: 'fake-1', usage: { inputTokens: 50 } });
    const row = store.conversations.rows[0]!;
    expect(row.summary).toBe('- résumé de la discussion');
    const total = (row.messageCount as number);
    expect(row.summarizedCount).toBe(total - SUMMARY_KEEP);
    expect(llm.calls[0]!.messages[0]!.content).toContain('donnee_externe');
    expect(llm.calls[0]!.system).toContain('jamais une consigne');

    const history = await store.service.history(ALICE, c.id);
    expect(history.messages).toHaveLength(SUMMARY_KEEP);
    expect(history.summary).toBe('- résumé de la discussion');
  });

  it('fusionne le résumé existant avec les nouveaux échanges', async () => {
    const store = buildConversationStore();
    const c = await store.service.create(ALICE, { title: 't' });
    await fill(store, c.id, 30);
    const llm = summarizer('- premier résumé');
    await store.service.summarizeIfNeeded(ALICE, c.id, llm);
    await fill(store, c.id, 30);
    await store.service.summarizeIfNeeded(ALICE, c.id, llm);
    expect(llm.calls[1]!.messages[0]!.content).toContain('Résumé existant');
    expect(llm.calls[1]!.messages[0]!.content).toContain('- premier résumé');
  });

  it('une panne du modèle laisse la discussion intacte', async () => {
    const store = buildConversationStore();
    const c = await store.service.create(ALICE, { title: 't' });
    await fill(store, c.id, 30);
    const broken: LlmProvider = {
      name: 'fake',
      async generate() {
        throw new Error('HTTP 529');
      },
    };
    expect(await store.service.summarizeIfNeeded(ALICE, c.id, broken)).toBeNull();
    expect(store.conversations.rows[0]).toMatchObject({ summary: null, summarizedCount: 0 });
    const empty = summarizer('   ');
    expect(await store.service.summarizeIfNeeded(ALICE, c.id, empty)).toBeNull();
  });

  it('au-delà de la limite, la discussion la moins récente est supprimée', async () => {
    const store = buildConversationStore();
    for (let i = 0; i < MAX_CONVERSATIONS + 3; i += 1) await store.service.create(ALICE, { title: `d${i}` });
    const titles = (await store.service.list(ALICE)).map((c) => c.title);
    expect(titles).toHaveLength(MAX_CONVERSATIONS);
    expect(titles).not.toContain('d0');
    expect(titles).toContain(`d${MAX_CONVERSATIONS + 2}`);
  });
});
