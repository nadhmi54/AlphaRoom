import { describe, expect, it } from 'vitest';
import { LlmError, type LlmProvider } from '../llm/llm-provider.js';
import { StubLlmProvider } from '../llm/stub-llm-provider.js';
import { allowedFromData, narrate } from './narration.js';

const data = { headline: 'Passage 1 → passage 2', improved: 1, rate: -0.0222, events: [{ minute: 11, label: 'La Fed durcit à 25 pb' }] };

const provider = (out: string | Error): LlmProvider => ({
  name: 'fake',
  async generate() {
    if (out instanceof Error) throw out;
    return { text: out, model: 'm', usage: { inputTokens: 10, outputTokens: 5 } };
  },
});

describe('commentaire du modèle', () => {
  it('stub : pas d’appel, pas de commentaire', async () => {
    const result = await narrate(new StubLlmProvider(), 'replay', data, 30);
    expect(result).toMatchObject({ commentary: null, source: 'none' });
  });

  it('accepte un texte dont les chiffres viennent de l’analyse', async () => {
    const result = await narrate(provider('Un étudiant s’est amélioré ; la baisse était de 2,2 % après la news de la minute 11.'), 'replay', data, 30);
    expect(result.source).toBe('llm');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it('accepte un chiffre cité dans le texte d’une actualité', async () => {
    const result = await narrate(provider('La news évoquait 25 pb.'), 'replay', data, 30);
    expect(result.source).toBe('llm');
  });

  it('refuse un chiffre inventé et garde la consommation', async () => {
    const result = await narrate(provider('Le marché a perdu 18 % ce jour-là.'), 'replay', data, 30);
    expect(result.commentary).toBeNull();
    expect(result.reason).toContain('refusé');
    expect(result.usage).toBeDefined();
  });

  it('refuse un conseil', async () => {
    const result = await narrate(provider('Vendez avant la prochaine news.'), 'replay', data, 30);
    expect(result.commentary).toBeNull();
  });

  it('modèle indisponible : pas de commentaire, pas d’erreur', async () => {
    const result = await narrate(provider(new LlmError('HTTP 500', 500)), 'replay', data, 30);
    expect(result).toMatchObject({ commentary: null, reason: 'Modèle indisponible.' });
  });

  it('les fractions peuvent être citées en pourcentage seulement avec « % »', () => {
    const allowed = allowedFromData({ rate: -0.0222 });
    expect(allowed.percent.some((n) => Math.abs(n - 2.22) < 1e-9)).toBe(true);
  });
});
