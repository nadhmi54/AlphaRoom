import { AnthropicLlmProvider } from './anthropic-llm-provider.js';
import type { LlmProvider } from './llm-provider.js';
import { OpenAiCompatibleLlmProvider } from './openai-compatible-llm-provider.js';
import { StubLlmProvider } from './stub-llm-provider.js';

export interface LlmConfig {
  provider?: string;
  apiKey?: string;
  model?: string;
  /** Adresse de l'API pour AI_PROVIDER=openai-compat (Groq, Gemini, OpenRouter, Ollama…). */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Choisit le fournisseur selon l'environnement. Par défaut : le stub, donc
 * rien ne part vers l'extérieur tant qu'on ne l'a pas décidé explicitement.
 */
export function createLlmProvider(config: LlmConfig): LlmProvider {
  const provider = (config.provider ?? 'stub').trim().toLowerCase() || 'stub';
  if (provider === 'stub') return new StubLlmProvider();
  if (provider === 'anthropic') {
    if (!config.apiKey) throw new Error('AI_PROVIDER=anthropic exige ANTHROPIC_API_KEY.');
    if (!config.model) throw new Error('AI_PROVIDER=anthropic exige AI_MODEL (identifiant du modèle).');
    return new AnthropicLlmProvider({ apiKey: config.apiKey, model: config.model, fetchImpl: config.fetchImpl });
  }
  if (provider === 'openai-compat') {
    if (!config.baseUrl) throw new Error('AI_PROVIDER=openai-compat exige AI_BASE_URL (adresse de l’API).');
    if (!config.model) throw new Error('AI_PROVIDER=openai-compat exige AI_MODEL (identifiant du modèle).');
    const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(config.baseUrl);
    if (!config.apiKey && !local) throw new Error('AI_PROVIDER=openai-compat exige AI_API_KEY (sauf serveur local).');
    return new OpenAiCompatibleLlmProvider({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      fetchImpl: config.fetchImpl,
    });
  }
  throw new Error(`AI_PROVIDER inconnu : « ${provider} » (valeurs possibles : stub, anthropic, openai-compat).`);
}
