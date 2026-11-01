import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse } from './llm-provider.js';

export interface OpenAiCompatibleOptions {
  /** Ex. https://api.groq.com/openai/v1 (sans « /chat/completions »). */
  baseUrl: string;
  /** Absente seulement pour un serveur local (Ollama). */
  apiKey?: string;
  model: string;
  timeoutMs?: number;
  /** Nouvelles tentatives sur 429 / 5xx. */
  maxRetries?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
}

interface ChatBody {
  choices?: Array<{ message?: { content?: string | null } }>;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string } | string;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);

/**
 * Fournisseur « compatible OpenAI » : Groq, Google Gemini, OpenRouter, Mistral,
 * Ollama local… tous exposent la même route `POST {baseUrl}/chat/completions`.
 * Permet d'utiliser un modèle gratuit sans changer le reste du module IA.
 */
export class OpenAiCompatibleLlmProvider implements LlmProvider {
  readonly name = 'openai-compat';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAiCompatibleOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const { baseUrl, apiKey, model, timeoutMs = 30_000, maxRetries = 1, retryDelayMs = 500 } = this.options;
    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const body = JSON.stringify({
      model,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.2,
      messages: [{ role: 'system', content: request.system }, ...request.messages],
    });
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;

    let lastError: LlmError | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (attempt > 0 && retryDelayMs > 0) await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
      let response: Response;
      try {
        response = await this.fetchImpl(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        lastError = new LlmError(`Appel au modèle impossible : ${(error as Error).message}`);
        continue;
      }

      const data = (await response.json().catch(() => ({}))) as ChatBody;
      if (response.ok) {
        // Certains modèles « raisonneurs » entourent leur réflexion de <think>…</think> : on la retire.
        const raw = data.choices?.[0]?.message?.content ?? '';
        const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        return {
          text,
          model: data.model ?? model,
          usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
        };
      }
      const detail = typeof data.error === 'string' ? data.error : data.error?.message;
      // Jamais la clé ni la requête dans le message.
      lastError = new LlmError(`Le modèle a refusé la requête (${response.status}) : ${detail ?? 'erreur inconnue'}`, response.status);
      if (!RETRYABLE.has(response.status)) break;
    }
    throw lastError ?? new LlmError('Appel au modèle impossible.');
  }
}
