import { describe, expect, it, vi } from 'vitest';
import { AnthropicLlmProvider } from './anthropic-llm-provider.js';
import { OpenAiCompatibleLlmProvider } from './openai-compatible-llm-provider.js';
import { createLlmProvider } from './create-llm-provider.js';
import { LlmError } from './llm-provider.js';
import { StubLlmProvider } from './stub-llm-provider.js';

const request = { system: 'sys', messages: [{ role: 'user' as const, content: 'Bonjour' }], maxTokens: 100 };

const okResponse = () =>
  new Response(
    JSON.stringify({
      content: [{ type: 'text', text: 'Salut ' }, { type: 'text', text: 'toi' }],
      model: 'modele-test',
      usage: { input_tokens: 12, output_tokens: 3 },
    }),
    { status: 200 },
  );

describe('StubLlmProvider', () => {
  it('répond sans réseau et mémorise les appels', async () => {
    const stub = new StubLlmProvider();
    const out = await stub.generate(request);
    expect(out.model).toBe('stub');
    expect(out.text).toContain('Réponse de test');
    expect(stub.calls).toHaveLength(1);
  });

  it('accepte une réponse scénarisée', async () => {
    const stub = new StubLlmProvider(() => 'ok');
    expect((await stub.generate(request)).text).toBe('ok');
  });
});

describe('AnthropicLlmProvider', () => {
  it('envoie la requête attendue et lit la réponse', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const provider = new AnthropicLlmProvider({ apiKey: 'cle-test', model: 'modele-test', fetchImpl });
    const out = await provider.generate(request);

    expect(out).toEqual({ text: 'Salut toi', model: 'modele-test', usage: { inputTokens: 12, outputTokens: 3 } });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('cle-test');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'modele-test', max_tokens: 100, system: 'sys', temperature: 0.2 });
    expect(body.messages).toEqual(request.messages);
  });

  it('retente une fois sur une limite de débit puis réussit', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'trop vite' } }), { status: 429 }))
      .mockResolvedValueOnce(okResponse());
    const provider = new AnthropicLlmProvider({ apiKey: 'k', model: 'm', fetchImpl, retryDelayMs: 0 });
    expect((await provider.generate(request)).text).toBe('Salut toi');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('ne retente pas sur une erreur d’authentification et ne révèle pas la clé', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), { status: 401 }));
    const provider = new AnthropicLlmProvider({ apiKey: 'cle-secrete', model: 'm', fetchImpl, retryDelayMs: 0 });
    const error = await provider.generate(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).status).toBe(401);
    expect((error as LlmError).message).not.toContain('cle-secrete');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('échoue proprement après épuisement des tentatives réseau', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('réseau coupé'));
    const provider = new AnthropicLlmProvider({ apiKey: 'k', model: 'm', fetchImpl, retryDelayMs: 0, maxRetries: 1 });
    await expect(provider.generate(request)).rejects.toThrow('réseau coupé');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('createLlmProvider', () => {
  it('utilise le stub par défaut', () => {
    expect(createLlmProvider({}).name).toBe('stub');
    expect(createLlmProvider({ provider: '' }).name).toBe('stub');
  });

  it('exige une clé et un modèle pour Anthropic', () => {
    expect(() => createLlmProvider({ provider: 'anthropic', model: 'm' })).toThrow('ANTHROPIC_API_KEY');
    expect(() => createLlmProvider({ provider: 'anthropic', apiKey: 'k' })).toThrow('AI_MODEL');
    expect(createLlmProvider({ provider: 'anthropic', apiKey: 'k', model: 'm' }).name).toBe('anthropic');
  });

  it('refuse un fournisseur inconnu', () => {
    expect(() => createLlmProvider({ provider: 'autre' })).toThrow('AI_PROVIDER inconnu');
  });
});

describe('OpenAiCompatibleLlmProvider', () => {
  const chatOk = (content = 'Salut toi') =>
    new Response(
      JSON.stringify({ choices: [{ message: { content } }], model: 'm-test', usage: { prompt_tokens: 12, completion_tokens: 3 } }),
      { status: 200 },
    );

  it('envoie la requête chat/completions attendue et lit la réponse', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(chatOk());
    const provider = new OpenAiCompatibleLlmProvider({ baseUrl: 'https://api.exemple.com/v1/', apiKey: 'cle-test', model: 'm-test', fetchImpl });
    const out = await provider.generate(request);

    expect(out).toEqual({ text: 'Salut toi', model: 'm-test', usage: { inputTokens: 12, outputTokens: 3 } });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.exemple.com/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer cle-test');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'm-test', max_tokens: 100, temperature: 0.2 });
    expect(body.messages).toEqual([{ role: 'system', content: 'sys' }, ...request.messages]);
  });

  it('retire la réflexion <think> et fonctionne sans clé (serveur local)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(chatOk('<think>je réfléchis</think>Réponse nette'));
    const provider = new OpenAiCompatibleLlmProvider({ baseUrl: 'http://localhost:11434/v1', model: 'm', fetchImpl });
    expect((await provider.generate(request)).text).toBe('Réponse nette');
    expect(fetchImpl.mock.calls[0]![1].headers.authorization).toBeUndefined();
  });

  it('retente sur 429 puis réussit ; ne révèle pas la clé sur 401', async () => {
    const retry = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'trop vite' } }), { status: 429 }))
      .mockResolvedValueOnce(chatOk());
    const a = new OpenAiCompatibleLlmProvider({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', fetchImpl: retry, retryDelayMs: 0 });
    expect((await a.generate(request)).text).toBe('Salut toi');

    const denied = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }));
    const b = new OpenAiCompatibleLlmProvider({ baseUrl: 'https://x/v1', apiKey: 'cle-secrete', model: 'm', fetchImpl: denied, retryDelayMs: 0 });
    const error = await b.generate(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).message).not.toContain('cle-secrete');
    expect(denied).toHaveBeenCalledTimes(1);
  });

  it('est choisi par createLlmProvider avec ses exigences', () => {
    expect(() => createLlmProvider({ provider: 'openai-compat', model: 'm', apiKey: 'k' })).toThrow('AI_BASE_URL');
    expect(() => createLlmProvider({ provider: 'openai-compat', baseUrl: 'https://x/v1', apiKey: 'k' })).toThrow('AI_MODEL');
    expect(() => createLlmProvider({ provider: 'openai-compat', baseUrl: 'https://x/v1', model: 'm' })).toThrow('AI_API_KEY');
    expect(createLlmProvider({ provider: 'openai-compat', baseUrl: 'http://localhost:11434/v1', model: 'm' }).name).toBe('openai-compat');
    expect(createLlmProvider({ provider: 'openai-compat', baseUrl: 'https://x/v1', model: 'm', apiKey: 'k' }).name).toBe('openai-compat');
  });
});
