import {
  LlmError,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
} from './llm-provider.js';

export interface AnthropicOptions {
  apiKey: string;
  /** Identifiant du modèle (variable AI_MODEL) : volontairement sans valeur par défaut. */
  model: string;
  timeoutMs?: number;
  /** Nouvelles tentatives sur 429 / 5xx. */
  maxRetries?: number;
  retryDelayMs?: number;
  /** Remplaçable en test. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

interface AnthropicBody {
  content?: Array<{ type: string; text?: string }>;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);

/** Appelle l'API Messages d'Anthropic en HTTP simple, sans dépendance supplémentaire. */
export class AnthropicLlmProvider implements LlmProvider {
  readonly name = 'anthropic';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: AnthropicOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const { apiKey, model, timeoutMs = 30_000, maxRetries = 1, retryDelayMs = 500 } = this.options;
    const url = `${this.options.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`;
    const body = JSON.stringify({
      model,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.2,
      system: request.system,
      messages: request.messages,
    });

    let lastError: LlmError | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (attempt > 0 && retryDelayMs > 0) await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        lastError = new LlmError(`Appel au modèle impossible : ${(error as Error).message}`);
        continue;
      }

      const data = (await response.json().catch(() => ({}))) as AnthropicBody;
      if (response.ok) {
        const text = (data.content ?? [])
          .filter((block) => block.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text)
          .join('');
        return {
          text,
          model: data.model ?? model,
          usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 },
        };
      }
      // On ne reprend la réponse d'erreur que sous forme de message : jamais la clé ni la requête.
      lastError = new LlmError(`Le modèle a refusé la requête (${response.status}) : ${data.error?.message ?? 'erreur inconnue'}`, response.status);
      if (!RETRYABLE.has(response.status)) break;
    }
    throw lastError ?? new LlmError('Appel au modèle impossible.');
  }
}
