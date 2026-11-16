import { writeFileSync } from 'node:fs';
import { buildToolbox } from '../agent/agent-tools.js';
import { runCoachAgent } from '../agent/coach-agent.js';
import { createLlmProvider } from '../llm/create-llm-provider.js';
import { LlmError, type LlmProvider, type ToolResponse } from '../llm/llm-provider.js';
import { EVAL_CASES } from './cases.js';
import { buildEvalMarket, buildEvalSession } from './eval-environment.js';
import { renderReport } from './report.js';
import { scoreCase, summarize } from './scoring.js';
import type { CaseResult, CaseRun, EvalCase } from './eval-types.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** « Please try again in 18.8175s » (Groq, OpenAI…) → millisecondes, sinon null. */
export function retryAfterMs(message: string): number | null {
  const m = /try again in\s+(?:(\d+)m)?\s*([\d.]+)\s*(ms|s)\b/i.exec(message);
  if (!m) return null;
  const minutes = m[1] ? Number(m[1]) : 0;
  const value = Number(m[2]);
  return Math.ceil(minutes * 60_000 + (m[3].toLowerCase() === 'ms' ? value : value * 1000));
}

/**
 * Enveloppe le modèle pour respecter un plafond de jetons par minute (offres gratuites : Groq = 8 000 TPM).
 * Avant chaque appel, on attend que la fenêtre glissante de 60 s ait assez de place pour un appel
 * de la taille du précédent ; une erreur 429 est réessayée sur CET appel, après le délai indiqué.
 */
export function withTokenBudget(llm: LlmProvider, tokensPerMinute: number, log: (msg: string) => void = () => {}): LlmProvider {
  const window: { at: number; tokens: number }[] = [];
  let estimate = Math.min(4000, tokensPerMinute);
  const used = (now: number) => {
    while (window.length > 0 && now - window[0].at >= 60_000) window.shift();
    return window.reduce((sum, w) => sum + w.tokens, 0);
  };
  const waitForRoom = async () => {
    for (;;) {
      const now = Date.now();
      if (used(now) + estimate <= tokensPerMinute || window.length === 0) return;
      const waitMs = 60_000 - (now - window[0].at) + 250;
      log(`  … pause ${Math.ceil(waitMs / 1000)} s (limite ${tokensPerMinute} jetons/min)`);
      await sleep(waitMs);
    }
  };
  const wrap = <A extends unknown[]>(fn: (...args: A) => Promise<ToolResponse>) => async (...args: A): Promise<ToolResponse> => {
    for (let attempt = 0; ; attempt += 1) {
      await waitForRoom();
      try {
        const response = await fn(...args);
        const tokens = response.usage.inputTokens + response.usage.outputTokens;
        window.push({ at: Date.now(), tokens });
        estimate = Math.min(Math.max(tokens, 500), tokensPerMinute);
        return response;
      } catch (error) {
        if (error instanceof LlmError && error.status === 429 && attempt < 5) {
          const waitMs = (retryAfterMs(error.message) ?? 20_000) + 1000;
          log(`  … limite atteinte, nouvel essai dans ${Math.ceil(waitMs / 1000)} s`);
          await sleep(waitMs);
          continue;
        }
        throw error;
      }
    }
  };
  return {
    ...llm,
    name: llm.name,
    generate: llm.generate.bind(llm),
    ...(llm.generateWithTools ? { generateWithTools: wrap(llm.generateWithTools.bind(llm)) } : {}),
    ...(llm.streamWithTools ? { streamWithTools: wrap(llm.streamWithTools.bind(llm)) } : {}),
  } as LlmProvider;
}

export interface RunOptions {
  llm: LlmProvider;
  cases?: EvalCase[];
  /** Pause entre deux questions (les offres gratuites limitent le débit). */
  delayMs?: number;
  retries?: number;
  onProgress?: (done: number, total: number, result: CaseResult) => void;
}

/** Passe chaque question au coach (mêmes outils, même prompt qu'en production) et la note. */
export async function runEval(options: RunOptions): Promise<CaseResult[]> {
  const cases = options.cases ?? EVAL_CASES;
  const session = buildEvalSession();
  const market = buildEvalMarket();
  const results: CaseResult[] = [];
  for (const testCase of cases) {
    const run = await runOne(options.llm, testCase, session, market, options.retries ?? 3);
    const result = scoreCase(testCase, run);
    results.push(result);
    options.onProgress?.(results.length, cases.length, result);
    if (options.delayMs) await sleep(options.delayMs);
  }
  return results;
}

async function runOne(llm: LlmProvider, testCase: EvalCase, session: ReturnType<typeof buildEvalSession>, market: ReturnType<typeof buildEvalMarket>, retries: number): Promise<CaseRun> {
  const started = Date.now();
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await runCoachAgent({
        llm,
        toolbox: buildToolbox({ session, participantId: 'a', memory: () => ({}), market }),
        question: testCase.question,
        history: testCase.history,
        durationMinutes: session.durationMinutes,
      });
      return {
        text: result.text,
        toolsUsed: result.toolsUsed,
        unverified: result.unverified,
        steps: result.steps,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      // Limite de débit (429) ou panne passagère : on attend puis on réessaie.
      const retryable = error instanceof LlmError && (error.status === 429 || (error.status ?? 0) >= 500);
      if (retryable && attempt < retries) {
        await sleep(20_000 * (attempt + 1));
        continue;
      }
      return { text: null, toolsUsed: [], unverified: [], steps: 0, inputTokens: 0, outputTokens: 0, durationMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

function parseArgs(argv: string[]) {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return { only: get('only'), limit: get('limit'), out: get('out') ?? 'ai-eval-report.md', delay: get('delay'), tpm: get('tpm') };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseLlm = createLlmProvider({
    provider: process.env.AI_PROVIDER,
    apiKey: process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.AI_BASE_URL,
    model: process.env.AI_MODEL,
  });
  // Plafond de jetons par minute : --tpm, ou AI_TPM dans .env (0 = pas de plafond). Groq gratuit : 8 000.
  const tpm = Number(args.tpm ?? process.env.AI_TPM ?? (/groq/i.test(process.env.AI_BASE_URL ?? '') ? 8000 : 0));
  // eslint-disable-next-line no-console
  const llm = tpm > 0 ? withTokenBudget(baseLlm, tpm, (msg) => console.log(msg)) : baseLlm;
  if (llm.name === 'stub' || !llm.generateWithTools) {
    // eslint-disable-next-line no-console
    console.error('Le banc d’évaluation a besoin d’un vrai modèle : renseigne AI_PROVIDER, AI_BASE_URL, AI_MODEL et AI_API_KEY dans backend/.env.');
    process.exit(1);
  }
  let cases = EVAL_CASES;
  if (args.only) cases = cases.filter((c) => c.category === args.only || c.id === args.only);
  if (args.limit) cases = cases.slice(0, Math.max(1, Number(args.limit)));
  if (cases.length === 0) {
    // eslint-disable-next-line no-console
    console.error(`Aucune question ne correspond à « ${args.only} ».`);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log(`Évaluation de ${cases.length} question(s) avec ${process.env.AI_MODEL ?? llm.name}${tpm > 0 ? ` (plafond ${tpm} jetons/min)` : ''}…`);
  const results = await runEval({
    llm,
    cases,
    delayMs: args.delay ? Number(args.delay) : 1500,
    onProgress: (done, total, r) => {
      // eslint-disable-next-line no-console
      console.log(`[${done}/${total}] ${r.passed ? 'OK    ' : 'ÉCHEC '} ${r.case.id}  ${r.case.question.slice(0, 60)}${r.passed ? '' : `\n          → ${r.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`).join(' | ')}`}`);
    },
  });
  const summary = summarize(results);
  writeFileSync(args.out, renderReport(results, summary, process.env.AI_MODEL ?? llm.name), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`\nScore global : ${summary.passed}/${summary.total} (${Math.round(summary.score * 100)} %). Rapport : ${args.out}`);
}

if (process.argv[1] && process.argv[1].endsWith('run-eval.js')) {
  main().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
