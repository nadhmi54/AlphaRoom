import {
  LlmError,
  type AgentMessage,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  type ToolRequest,
  type ToolResponse,
} from './llm-provider.js';

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
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
    };
  }>;
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
    const data = await this.post({
      model: this.options.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.2,
      messages: [{ role: 'system', content: request.system }, ...request.messages],
    });
    return { text: cleanText(data.choices?.[0]?.message?.content), model: data.model ?? this.options.model, usage: usageOf(data) };
  }

  /** Les modèles « raisonneurs » gpt-oss acceptent un niveau d'effort : « medium » garde de la marge pour la réponse. */
  private reasoningParams(): Record<string, unknown> {
    return /gpt-oss/i.test(this.options.model) ? { reasoning_effort: 'medium' } : {};
  }

  /** Mode « agent » : le modèle peut demander des outils (format `tools` / `tool_calls` d'OpenAI). */
  async generateWithTools(request: ToolRequest): Promise<ToolResponse> {
    const payload: Record<string, unknown> = {
      model: this.options.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.2,
      messages: [{ role: 'system', content: request.system }, ...request.messages.map(toWireMessage)],
      ...this.reasoningParams(),
    };
    if (request.tools.length > 0) {
      payload.tools = request.tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      }));
      payload.tool_choice = 'auto';
    }
    const data = await this.post(payload);
    const message = data.choices?.[0]?.message;
    const toolCalls = (message?.tool_calls ?? []).flatMap((call, index) =>
      call.function?.name
        ? [{ id: call.id ?? `call_${index}`, name: call.function.name, arguments: call.function.arguments ?? '{}' }]
        : [],
    );
    return { text: cleanText(message?.content), toolCalls, model: data.model ?? this.options.model, usage: usageOf(data) };
  }

  /**
   * Mode agent en direct : le texte arrive morceau par morceau (`onText`) ; les demandes d'outils
   * sont reconstituées à partir des fragments. Les nouvelles tentatives ne valent que tant que
   * rien n'a été reçu (429 / 5xx) : une fois le flux commencé, on ne rejoue pas.
   */
  async streamWithTools(request: ToolRequest, onText: (delta: string) => void): Promise<ToolResponse> {
    const { baseUrl, apiKey, timeoutMs = 30_000, maxRetries = 1, retryDelayMs = 500 } = this.options;
    const payload: Record<string, unknown> = {
      model: this.options.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.2,
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: 'system', content: request.system }, ...request.messages.map(toWireMessage)],
      ...this.reasoningParams(),
    };
    if (request.tools.length > 0) {
      payload.tools = request.tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      }));
      payload.tool_choice = 'auto';
    }
    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const body = JSON.stringify(payload);

    let lastError: LlmError | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (attempt > 0 && retryDelayMs > 0) await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
      let response: Response;
      try {
        // Un flux peut durer plus longtemps qu'une réponse simple : délai total doublé.
        response = await this.fetchImpl(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs * 2) });
      } catch (error) {
        lastError = new LlmError(`Appel au modèle impossible : ${(error as Error).message}`);
        continue;
      }
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ChatBody;
        const detail = typeof data.error === 'string' ? data.error : data.error?.message;
        lastError = new LlmError(`Le modèle a refusé la requête (${response.status}) : ${detail ?? 'erreur inconnue'}`, response.status);
        if (!RETRYABLE.has(response.status)) break;
        continue;
      }
      if (!response.body) {
        lastError = new LlmError('Réponse du modèle vide.');
        break;
      }
      try {
        return await readStream(response.body, onText, this.options.model);
      } catch (error) {
        throw error instanceof LlmError ? error : new LlmError(`Flux interrompu : ${(error as Error).message}`);
      }
    }
    throw lastError ?? new LlmError('Appel au modèle impossible.');
  }

  /** Envoie la requête avec les nouvelles tentatives sur 429 / 5xx. Jamais la clé dans une erreur. */
  private async post(payload: Record<string, unknown>): Promise<ChatBody> {
    const { baseUrl, apiKey, timeoutMs = 30_000, maxRetries = 1, retryDelayMs = 500 } = this.options;
    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const body = JSON.stringify(payload);
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
      if (response.ok) return data;
      const detail = typeof data.error === 'string' ? data.error : data.error?.message;
      lastError = new LlmError(`Le modèle a refusé la requête (${response.status}) : ${detail ?? 'erreur inconnue'}`, response.status);
      if (!RETRYABLE.has(response.status)) break;
    }
    throw lastError ?? new LlmError('Appel au modèle impossible.');
  }
}

/** Certains modèles « raisonneurs » entourent leur réflexion de <think>…</think> : on la retire. */
function cleanText(raw: string | null | undefined): string {
  return (raw ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

function usageOf(data: ChatBody) {
  return { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 };
}

function toWireMessage(message: AgentMessage): Record<string, unknown> {
  if (message.role === 'tool') return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

interface StreamChunk {
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>;
    };
  }>;
  error?: { message?: string } | string;
}

/** Lit un flux « server-sent events » au format OpenAI et reconstitue la réponse complète. */
async function readStream(stream: ReadableStream<Uint8Array>, onText: (delta: string) => void, fallbackModel: string): Promise<ToolResponse> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const think = new ThinkFilter();
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  let text = '';
  let model = fallbackModel;
  let usage = { inputTokens: 0, outputTokens: 0 };
  let buffer = '';

  const handle = (line: string) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (data === '' || data === '[DONE]') return;
    let chunk: StreamChunk;
    try {
      chunk = JSON.parse(data) as StreamChunk;
    } catch {
      return;
    }
    if (chunk.error) {
      const detail = typeof chunk.error === 'string' ? chunk.error : chunk.error.message;
      throw new LlmError(`Le modèle a signalé une erreur : ${detail ?? 'inconnue'}`);
    }
    if (chunk.model) model = chunk.model;
    if (chunk.usage) usage = { inputTokens: chunk.usage.prompt_tokens ?? 0, outputTokens: chunk.usage.completion_tokens ?? 0 };
    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta;
      if (delta?.content) {
        const visible = think.push(delta.content);
        if (visible) {
          text += visible;
          onText(visible);
        }
      }
      for (const part of delta?.tool_calls ?? []) {
        const index = part.index ?? 0;
        const current = calls.get(index) ?? { id: '', name: '', arguments: '' };
        if (part.id) current.id = part.id;
        if (part.function?.name) current.name += part.function.name;
        if (part.function?.arguments) current.arguments += part.function.arguments;
        calls.set(index, current);
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      handle(buffer.slice(0, newline).replace(/\r$/, ''));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  if (buffer.trim() !== '') handle(buffer.trim());
  const rest = think.flush();
  if (rest) {
    text += rest;
    onText(rest);
  }

  const toolCalls = [...calls.entries()]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([index, call]) => (call.name ? [{ id: call.id || `call_${index}`, name: call.name, arguments: call.arguments || '{}' }] : []));
  return { text: text.trim(), toolCalls, model, usage };
}

/** Retire en direct la réflexion `<think>…</think>` de certains modèles (même coupée entre deux morceaux). */
class ThinkFilter {
  private inside = false;
  private pending = '';

  /** Fin du flux : ce qui restait en attente (début de balise qui n'a jamais abouti) est du vrai texte. */
  flush(): string {
    const rest = this.inside ? '' : this.pending;
    this.pending = '';
    return rest;
  }

  push(chunk: string): string {
    let input = this.pending + chunk;
    this.pending = '';
    let out = '';
    for (;;) {
      if (this.inside) {
        const end = input.indexOf('</think>');
        if (end < 0) {
          this.pending = tail(input, '</think>');
          return out;
        }
        input = input.slice(end + '</think>'.length);
        this.inside = false;
      } else {
        const start = input.indexOf('<think>');
        if (start < 0) {
          const keep = tail(input, '<think>');
          this.pending = keep;
          return out + input.slice(0, input.length - keep.length);
        }
        out += input.slice(0, start);
        input = input.slice(start + '<think>'.length);
        this.inside = true;
      }
    }
  }
}

/** Fin de `text` qui pourrait être le début de `marker` (à garder pour le morceau suivant). */
function tail(text: string, marker: string): string {
  for (let size = Math.min(marker.length - 1, text.length); size > 0; size -= 1) {
    if (marker.startsWith(text.slice(text.length - size))) return text.slice(text.length - size);
  }
  return '';
}
