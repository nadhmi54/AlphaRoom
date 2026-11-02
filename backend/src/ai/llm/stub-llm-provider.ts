import type { LlmProvider, LlmRequest, LlmResponse } from './llm-provider.js';

type Responder = (request: LlmRequest) => string;

/**
 * Faux fournisseur : répond sans réseau ni coût. Sert au développement, aux
 * tests et à la démonstration quand aucune clé n'est configurée.
 */
export class StubLlmProvider implements LlmProvider {
  readonly name = 'stub';
  readonly calls: LlmRequest[] = [];

  constructor(private readonly responder?: Responder) {}

  generate(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push(request);
    const text =
      this.responder?.(request) ??
      '[Réponse de test] Aucun modèle n’est branché : configurez AI_PROVIDER pour obtenir une vraie réponse.';
    const chars = request.system.length + request.messages.reduce((sum, m) => sum + m.content.length, 0);
    return Promise.resolve({
      text,
      model: 'stub',
      usage: { inputTokens: Math.ceil(chars / 4), outputTokens: Math.ceil(text.length / 4) },
    });
  }
}
