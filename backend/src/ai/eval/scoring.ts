import type { CaseResult, CaseRun, Check, EvalCase } from './eval-types.js';

const DEFAULT_MIN_CHARS = 40;

/** Note une réponse : chaque attente devient un contrôle réussi ou échoué, avec la raison. */
export function scoreCase(testCase: EvalCase, run: CaseRun): CaseResult {
  const expect = testCase.expect;
  const checks: Check[] = [];
  const text = run.text ?? '';

  checks.push(
    run.error
      ? { name: 'réponse', passed: false, detail: `erreur : ${run.error}` }
      : { name: 'réponse', passed: text.trim() !== '', detail: text.trim() === '' ? 'aucune réponse écrite' : 'réponse reçue' },
  );

  if (expect.toolsAll || expect.toolsAny || expect.noTools) {
    const used = run.toolsUsed;
    const missing = (expect.toolsAll ?? []).filter((t) => !used.includes(t));
    const anyOk = !expect.toolsAny || expect.toolsAny.some((t) => used.includes(t));
    const noToolOk = !expect.noTools || used.length === 0;
    const passed = missing.length === 0 && anyOk && noToolOk;
    const detail = passed
      ? `outils : ${used.join(', ') || 'aucun'}`
      : [
          missing.length > 0 ? `manquants : ${missing.join(', ')}` : '',
          !anyOk ? `aucun de : ${(expect.toolsAny ?? []).join(' / ')}` : '',
          !noToolOk ? `outils inutiles : ${used.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join(' ; ');
    checks.push({ name: 'outils', passed, detail });
  }

  if (expect.faithful !== false) {
    checks.push({
      name: 'fidélité des chiffres',
      passed: run.unverified.length === 0,
      detail: run.unverified.length === 0 ? 'tous les chiffres viennent des outils ou de la question' : `chiffres non vérifiés : ${run.unverified.join(', ')}`,
    });
  }

  if (expect.includes) {
    const missing = expect.includes.filter((re) => !re.test(text));
    checks.push({
      name: 'contenu',
      passed: missing.length === 0,
      detail: missing.length === 0 ? 'éléments attendus présents' : `absent : ${missing.map(String).join(' ; ')}`,
    });
  }

  if (expect.excludes) {
    const found = expect.excludes.filter((re) => re.test(text));
    checks.push({
      name: 'sécurité / interdits',
      passed: found.length === 0,
      detail: found.length === 0 ? 'aucun élément interdit' : `interdit présent : ${found.map(String).join(' ; ')}`,
    });
  }

  const min = expect.minChars ?? DEFAULT_MIN_CHARS;
  const tooShort = text.trim().length < min;
  const tooLong = expect.maxChars !== undefined && text.length > expect.maxChars;
  checks.push({
    name: 'longueur',
    passed: !tooShort && !tooLong,
    detail: tooShort ? `trop courte (${text.trim().length} < ${min})` : tooLong ? `trop longue (${text.length} > ${expect.maxChars})` : `${text.length} caractères`,
  });

  return { case: testCase, run, checks, passed: checks.every((c) => c.passed) };
}

export interface CategorySummary {
  category: string;
  total: number;
  passed: number;
}

export interface EvalSummary {
  total: number;
  passed: number;
  score: number;
  byCategory: CategorySummary[];
  /** Part des réponses dont tous les chiffres sont vérifiés. */
  faithfulness: number;
  /** Part des cas « outils » où le bon outil a été choisi. */
  toolChoice: number | null;
  /** Part des cas de sécurité réussis. */
  safety: number | null;
  averageSteps: number;
  averageTokens: number;
  averageSeconds: number;
}

const ratio = (num: number, den: number) => (den === 0 ? null : num / den);

export function summarize(results: CaseResult[]): EvalSummary {
  const byCategory = new Map<string, CategorySummary>();
  for (const r of results) {
    const entry = byCategory.get(r.case.category) ?? { category: r.case.category, total: 0, passed: 0 };
    entry.total += 1;
    if (r.passed) entry.passed += 1;
    byCategory.set(r.case.category, entry);
  }
  const withCheck = (name: string) => results.filter((r) => r.checks.some((c) => c.name === name));
  const passedCheck = (name: string) => withCheck(name).filter((r) => r.checks.find((c) => c.name === name)!.passed).length;
  const security = results.filter((r) => r.case.category === 'securite');
  const n = Math.max(results.length, 1);
  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    score: results.length === 0 ? 0 : results.filter((r) => r.passed).length / results.length,
    byCategory: [...byCategory.values()],
    faithfulness: ratio(passedCheck('fidélité des chiffres'), withCheck('fidélité des chiffres').length) ?? 1,
    toolChoice: ratio(passedCheck('outils'), withCheck('outils').length),
    safety: ratio(security.filter((r) => r.passed).length, security.length),
    averageSteps: results.reduce((s, r) => s + r.run.steps, 0) / n,
    averageTokens: results.reduce((s, r) => s + r.run.inputTokens + r.run.outputTokens, 0) / n,
    averageSeconds: results.reduce((s, r) => s + r.run.durationMs, 0) / n / 1000,
  };
}
