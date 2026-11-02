import { describe, expect, it } from 'vitest';
import { UserRole } from '../../users/user-role.enum.js';
import { AiAccessError } from '../context/ai-context.js';
import { buildPanicTuesday } from '../fixtures/panic-tuesday.js';
import { LlmError, type LlmProvider } from '../llm/llm-provider.js';
import { StubLlmProvider } from '../llm/stub-llm-provider.js';
import { evaluateParticipant } from './report-evaluator.js';

const session = buildPanicTuesday();
const teacher = { id: 'prof', role: UserRole.GAME_MASTER };
const fixedNow = () => new Date('2026-11-01T10:00:00Z');

const goodAnswer = JSON.stringify({
  summary: 'Vous avez engagé 91,8 % du capital dès la minute 5 et vous n’avez pas réagi à la NEWS de la minute 11.',
  criteria: [
    { id: 'gestion_risque', comment: 'Exposition maximale de 91,8 % : au-delà de 80 %, la gestion du risque est insuffisante.', evidence: [{ type: 'trade', id: 'a1' }, { type: 'minute', value: 5 }] },
    { id: 'maitrise_pertes', comment: 'Perte maximale de 2,75 % au creux de la minute 22.', evidence: [{ type: 'minute', value: 22 }] },
    { id: 'protection_positions', comment: 'Aucune position n’est protégée par un stop-loss.', evidence: [{ type: 'trade', id: 'a1' }] },
    { id: 'reactivite', comment: 'Aucune exécution après la NEWS de la minute 11.', evidence: [{ type: 'event', id: 'ev-news' }] },
  ],
  strengths: [{ text: 'Perte maximale limitée à 2,8 %.', evidence: [{ type: 'minute', value: 22 }] }],
  improvements: [{ text: 'Poser un stop-loss sur la position ouverte à la minute 5.', evidence: [{ type: 'trade', id: 'a1' }] }],
});
// même rapport, mais avec un chiffre inventé
const badAnswer = goodAnswer.replace('91,8 % du capital', '97 % du capital');

describe('evaluateParticipant', () => {
  it('produit un rapport rédigé par le modèle, avec les notes calculées par le code', async () => {
    const provider = new StubLlmProvider(() => goodAnswer);
    const { report, trace } = await evaluateParticipant({ session, participantId: 'user-amine', requester: teacher, provider, now: fixedNow });

    expect(trace.source).toBe('llm');
    expect(trace.attempts).toBe(1);
    expect(report.alias).toBe('etu_01');
    expect(report.summary).toContain('91,8 %');
    const risque = report.criteria.find((c) => c.id === 'gestion_risque')!;
    expect(risque.score).toBe(1);
    expect(risque.comment).toContain('insuffisante');
    expect(risque.commentEvidence).toContainEqual({ type: 'trade', id: 'a1' });
    expect(report.overall.score).toBe(1.65);
  });

  it('ne laisse jamais le modèle choisir une note', async () => {
    const tampered = JSON.stringify({
      ...JSON.parse(goodAnswer),
      criteria: JSON.parse(goodAnswer).criteria.map((c: object) => ({ ...c, score: 4 })),
    });
    const provider = new StubLlmProvider(() => tampered);
    const { report } = await evaluateParticipant({ session, participantId: 'user-amine', requester: teacher, provider, now: fixedNow });
    expect(report.criteria.find((c) => c.id === 'gestion_risque')!.score).toBe(1);
  });

  it('redemande au modèle quand le validateur refuse, avec la liste des erreurs', async () => {
    const answers = [badAnswer, goodAnswer];
    const provider = new StubLlmProvider(() => answers.shift()!);
    const { trace } = await evaluateParticipant({ session, participantId: 'user-amine', requester: teacher, provider, now: fixedNow });

    expect(trace.source).toBe('llm');
    expect(trace.attempts).toBe(2);
    expect(trace.issues.some((i) => i.code === 'number_mismatch')).toBe(true);
    const retry = provider.calls[1]!.messages;
    expect(retry.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(retry.at(-1)!.content).toContain('refusée par le validateur');
  });

  it('retombe sur le texte généré par le code quand le modèle échoue toujours', async () => {
    const provider = new StubLlmProvider(() => badAnswer);
    const { report, trace } = await evaluateParticipant({ session, participantId: 'user-amine', requester: teacher, provider, maxAttempts: 2, now: fixedNow });

    expect(trace.source).toBe('rules');
    expect(trace.attempts).toBe(2);
    expect(report.criteria.find((c) => c.id === 'gestion_risque')!.comment).toContain('91,8 %');
    expect(report.overall.score).toBe(1.65);
  });

  it('retombe sur le texte de secours quand le fournisseur est indisponible', async () => {
    const down: LlmProvider = { name: 'anthropic', generate: () => Promise.reject(new LlmError('réseau coupé')) };
    const { report, trace } = await evaluateParticipant({ session, participantId: 'user-sarra', requester: teacher, provider: down, now: fixedNow });
    expect(trace.source).toBe('rules');
    expect(trace.issues[0]).toMatchObject({ code: 'llm_unavailable' });
    expect(report.overall.score).toBe(4);
  });

  it('propage une erreur de programmation au lieu de la masquer', async () => {
    const broken: LlmProvider = { name: 'x', generate: () => Promise.reject(new TypeError('bug')) };
    await expect(evaluateParticipant({ session, participantId: 'user-amine', requester: teacher, provider: broken })).rejects.toThrow('bug');
  });

  it('gère un étudiant qui n’a pas tradé : aucune note, aucune invention', async () => {
    const provider = new StubLlmProvider(() => JSON.stringify({ summary: 'Aucune exécution pendant la séance.', criteria: [], strengths: [], improvements: [] }));
    const { report, trace } = await evaluateParticipant({ session, participantId: 'user-lina', requester: teacher, provider, now: fixedNow });
    expect(trace.source).toBe('llm');
    expect(report.overall).toMatchObject({ score: null, evaluated: 0 });
    expect(report.missingData).toContain('no_trades');
  });

  it('enregistre une trace complète et reproductible', async () => {
    const provider = new StubLlmProvider(() => goodAnswer);
    const a = await evaluateParticipant({ session, participantId: 'user-amine', requester: teacher, provider, now: fixedNow });
    const b = await evaluateParticipant({ session, participantId: 'user-amine', requester: teacher, provider, now: fixedNow });
    expect(a.trace).toMatchObject({ promptVersion: 'v1', rubricVersion: 'alpharoom-default@v1', temperature: 0.2, generatedAt: '2026-11-01T10:00:00.000Z' });
    expect(a.trace.contextHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.trace.contextHash).toBe(b.trace.contextHash);
    expect(a.trace.usage.inputTokens).toBeGreaterThan(0);
  });

  it('ne contient ni nom ni identifiant interne', async () => {
    const provider = new StubLlmProvider(() => goodAnswer);
    const { report } = await evaluateParticipant({ session, participantId: 'user-amine', requester: teacher, provider, now: fixedNow });
    const json = JSON.stringify(report);
    expect(json).not.toContain('user-amine');
    expect(json).not.toContain('Amine');
    // et ce que le modèle a reçu non plus
    expect(JSON.stringify(provider.calls)).not.toContain('Amine');
  });

  it('refuse à un trader de générer un bilan', async () => {
    await expect(
      evaluateParticipant({ session, participantId: 'user-amine', requester: { id: 'user-amine', role: UserRole.TRADER }, provider: new StubLlmProvider() }),
    ).rejects.toThrow(AiAccessError);
  });
});
