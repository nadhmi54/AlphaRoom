import type { AiContext, ParticipantContext } from '../context/ai-context.js';
import type { Evidence } from '../metrics/metrics.js';
import type { CriterionScore, OverallScore } from '../rubric/rubric.js';
import type { LlmReportParts, ReportPoint, ValidationIssue } from './report-types.js';

/**
 * Validateur de sortie : la défense principale contre les hallucinations.
 *
 * Avant d'enregistrer un rapport rédigé par le modèle, le code vérifie :
 *   1. que c'est du JSON conforme au schéma attendu ;
 *   2. que chaque critère évalué est commenté exactement une fois ;
 *   3. que chaque preuve citée existe (exécution, événement, minute) ;
 *   4. que chaque CHIFFRE écrit dans le texte correspond à une donnée réelle
 *      (à la précision où il est écrit) ;
 *   5. qu'aucun conseil d'investissement ni prévision de prix ne se glisse.
 * En cas d'écart, la sortie est refusée : on redemande au modèle ou on
 * retombe sur le texte généré par le code.
 */

export const LIMITS = { summary: 800, comment: 500, point: 300, points: 5 } as const;

export interface ValidationResult {
  ok: boolean;
  parts?: LlmReportParts;
  issues: ValidationIssue[];
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Extrait l'objet JSON d'une réponse, même entourée de ```json … ```. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('aucun objet JSON');
  return JSON.parse(text.slice(start, end + 1));
}

export function validateReportParts(
  raw: string,
  context: AiContext,
  criteria: CriterionScore[],
  overall?: OverallScore,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  let data: unknown;
  try {
    data = extractJson(raw);
  } catch {
    return { ok: false, issues: [{ code: 'invalid_json', message: 'La réponse n’est pas un JSON valide.' }] };
  }
  if (!isObject(data)) {
    return { ok: false, issues: [{ code: 'invalid_shape', message: 'La réponse doit être un objet JSON.' }] };
  }

  const known = collectEvidence(context, criteria);
  const parts: LlmReportParts = { summary: '', criteria: [], strengths: [], improvements: [] };

  // summary
  if (typeof data.summary !== 'string' || data.summary.trim() === '') {
    issues.push({ code: 'invalid_shape', message: 'Le champ « summary » est obligatoire.', path: 'summary' });
  } else {
    parts.summary = data.summary.trim();
    if (parts.summary.length > LIMITS.summary) {
      issues.push({ code: 'too_long', message: `« summary » dépasse ${LIMITS.summary} caractères.`, path: 'summary' });
    }
  }

  // criteria
  const criteriaRaw = Array.isArray(data.criteria) ? data.criteria : null;
  if (!criteriaRaw) {
    issues.push({ code: 'invalid_shape', message: 'Le champ « criteria » doit être un tableau.', path: 'criteria' });
  } else {
    const seen = new Set<string>();
    const byId = new Map(criteria.map((c) => [c.id, c]));
    criteriaRaw.forEach((item, index) => {
      const path = `criteria[${index}]`;
      if (!isObject(item) || typeof item.id !== 'string' || typeof item.comment !== 'string') {
        issues.push({ code: 'invalid_shape', message: 'Chaque critère doit avoir « id » et « comment ».', path });
        return;
      }
      if (!byId.has(item.id)) {
        issues.push({ code: 'unknown_criterion', message: `Critère inconnu : ${item.id}.`, path });
        return;
      }
      if (seen.has(item.id)) {
        issues.push({ code: 'duplicate_criterion', message: `Critère commenté deux fois : ${item.id}.`, path });
        return;
      }
      seen.add(item.id);
      const evidence = readEvidence(item.evidence, `${path}.evidence`, known, issues);
      const comment = item.comment.trim();
      if (comment.length > LIMITS.comment) {
        issues.push({ code: 'too_long', message: `Le commentaire de ${item.id} dépasse ${LIMITS.comment} caractères.`, path });
      }
      if (byId.get(item.id)!.status === 'evaluated' && evidence.length === 0) {
        issues.push({ code: 'missing_evidence', message: `Le commentaire de ${item.id} doit citer au moins une preuve.`, path });
      }
      parts.criteria.push({ id: item.id, comment, evidence });
    });
    for (const criterion of criteria) {
      if (criterion.status === 'evaluated' && !seen.has(criterion.id)) {
        issues.push({ code: 'missing_criterion', message: `Le critère évalué « ${criterion.id} » n’est pas commenté.`, path: 'criteria' });
      }
    }
  }

  parts.strengths = readPoints(data.strengths, 'strengths', known, issues);
  parts.improvements = readPoints(data.improvements, 'improvements', known, issues);

  // Chiffres et conseils : sur tout le texte rédigé.
  const allowed = collectAllowedNumbers(context, criteria, overall);
  const texts: Array<[string, string]> = [
    ['summary', parts.summary],
    ...parts.criteria.map((c, i): [string, string] => [`criteria[${i}].comment`, c.comment]),
    ...parts.strengths.map((p, i): [string, string] => [`strengths[${i}].text`, p.text]),
    ...parts.improvements.map((p, i): [string, string] => [`improvements[${i}].text`, p.text]),
  ];
  for (const [path, text] of texts) {
    issues.push(...checkNumbers(text, allowed, path), ...checkAdvice(text, path));
  }

  return { ok: issues.length === 0, parts: issues.length === 0 ? parts : undefined, issues };
}

/* ------------------------------------------------------------------ */
/* Preuves                                                              */
/* ------------------------------------------------------------------ */

interface KnownEvidence {
  trades: Set<string>;
  events: Set<string>;
  maxMinute: number;
}

function collectEvidence(context: AiContext, criteria: CriterionScore[]): KnownEvidence {
  const trades = new Set<string>();
  const events = new Set<string>(context.events.map((e) => e.id));
  if (context.kind === 'participant') for (const t of (context as ParticipantContext).trades) trades.add(t.id);
  // Les métriques portent sur TOUTES les exécutions, même celles omises du contexte résumé.
  for (const criterion of criteria) {
    for (const e of criterion.evidence) {
      if (e.type === 'trade') trades.add(e.id);
      if (e.type === 'event') events.add(e.id);
    }
  }
  return { trades, events, maxMinute: context.session.durationMinutes };
}

function readEvidence(value: unknown, path: string, known: KnownEvidence, issues: ValidationIssue[]): Evidence[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push({ code: 'invalid_shape', message: 'Les preuves doivent être un tableau.', path });
    return [];
  }
  const out: Evidence[] = [];
  value.forEach((item, index) => {
    const where = `${path}[${index}]`;
    if (!isObject(item)) {
      issues.push({ code: 'invalid_shape', message: 'Preuve invalide.', path: where });
      return;
    }
    if (item.type === 'trade' && typeof item.id === 'string') {
      if (known.trades.has(item.id)) out.push({ type: 'trade', id: item.id });
      else issues.push({ code: 'unknown_evidence', message: `Exécution inconnue : ${item.id}.`, path: where });
    } else if (item.type === 'event' && typeof item.id === 'string') {
      if (known.events.has(item.id)) out.push({ type: 'event', id: item.id });
      else issues.push({ code: 'unknown_evidence', message: `Événement inconnu : ${item.id}.`, path: where });
    } else if (item.type === 'minute' && typeof item.value === 'number') {
      if (Number.isInteger(item.value) && item.value >= 0 && item.value <= known.maxMinute) {
        out.push({ type: 'minute', value: item.value });
      } else {
        issues.push({ code: 'unknown_evidence', message: `Minute hors séance : ${item.value}.`, path: where });
      }
    } else {
      issues.push({ code: 'invalid_shape', message: 'Preuve de type inconnu.', path: where });
    }
  });
  return out;
}

function readPoints(value: unknown, name: string, known: KnownEvidence, issues: ValidationIssue[]): ReportPoint[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push({ code: 'invalid_shape', message: `« ${name} » doit être un tableau.`, path: name });
    return [];
  }
  if (value.length > LIMITS.points) {
    issues.push({ code: 'too_long', message: `« ${name} » : ${LIMITS.points} éléments au plus.`, path: name });
  }
  const out: ReportPoint[] = [];
  value.slice(0, LIMITS.points).forEach((item, index) => {
    const path = `${name}[${index}]`;
    if (!isObject(item) || typeof item.text !== 'string' || item.text.trim() === '') {
      issues.push({ code: 'invalid_shape', message: 'Chaque élément doit avoir un « text ».', path });
      return;
    }
    const text = item.text.trim();
    if (text.length > LIMITS.point) {
      issues.push({ code: 'too_long', message: `Texte trop long (max ${LIMITS.point}).`, path });
    }
    const evidence = readEvidence(item.evidence, `${path}.evidence`, known, issues);
    if (evidence.length === 0) {
      issues.push({ code: 'missing_evidence', message: 'Chaque point doit citer au moins une preuve.', path });
    }
    out.push({ text, evidence });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Chiffres                                                             */
/* ------------------------------------------------------------------ */

export interface AllowedNumbers {
  /** Tout ce qui peut être cité hors pourcentage. */
  any: number[];
  /** Ce qui peut être cité suivi de « % » : un petit entier ne suffit pas. */
  percent: number[];
}

/** Tous les nombres que le texte a le droit de citer (valeurs absolues). */
export function collectAllowedNumbers(context: AiContext, criteria: CriterionScore[], overall?: OverallScore): AllowedNumbers {
  const any: number[] = [];
  const percent: number[] = [];
  const add = (n: number) => {
    const abs = Math.abs(n);
    any.push(abs);
    if (abs <= 1.0001) {
      any.push(abs * 100); // fraction → pourcentage
      percent.push(abs * 100);
    }
  };
  const walk = (value: unknown, key?: string) => {
    if (typeof value === 'number' && Number.isFinite(value)) add(value);
    else if (typeof value === 'string' && key === 'label') {
      const found = numbersIn(value).map((n) => Math.abs(n.value));
      any.push(...found);
      percent.push(...found);
    } else if (Array.isArray(value)) value.forEach((v) => walk(v));
    else if (isObject(value)) Object.entries(value).forEach(([k, v]) => walk(v, k));
  };
  walk(context);
  for (const c of criteria) {
    if (c.score !== null) any.push(c.score);
    any.push(c.outOf);
    if (c.value !== null) any.push(Math.abs(c.value));
    for (const text of [c.displayValue ?? '', c.rule]) {
      for (const n of numbersIn(text)) {
        any.push(Math.abs(n.value));
        if (/^[\s\u00a0\u202f]*%/.test(text.slice(n.end))) percent.push(Math.abs(n.value));
      }
    }
  }
  if (overall) {
    if (overall.score !== null) any.push(overall.score);
    any.push(overall.outOf, overall.evaluated, overall.total);
  }
  for (let i = 0; i <= Math.max(10, context.session.durationMinutes); i += 1) any.push(i); // minutes, petits comptes
  return { any, percent };
}

interface ParsedNumber {
  value: number;
  decimals: number;
  raw: string;
  /** Position de fin dans le texte, pour lire ce qui suit (« % »). */
  end: number;
}

/** Nombres écrits à la française ou à l'anglaise : « 2 700 », « 91,8 », « 0.5 ». */
export function numbersIn(text: string): ParsedNumber[] {
  const out: ParsedNumber[] = [];
  const regex = /\d+(?:[\s  ]\d{3})*(?:[.,]\d+)?/g;
  for (const match of text.matchAll(regex)) {
    const raw = match[0];
    const cleaned = raw.replace(/[\s  ]/g, '').replace(',', '.');
    const value = Number(cleaned);
    if (!Number.isFinite(value)) continue;
    const decimals = cleaned.includes('.') ? cleaned.split('.')[1]!.length : 0;
    out.push({ value, decimals, raw, end: (match.index ?? 0) + raw.length });
  }
  return out;
}

export function checkNumbers(text: string, allowed: AllowedNumbers, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const { value, decimals, raw, end } of numbersIn(text)) {
    // Tolérance : la moitié de la dernière décimale écrite (92 ↔ 91,8 ; 2,8 ↔ 2,754).
    const tolerance = 0.5 * 10 ** -decimals + 1e-9;
    const isPercent = /^[\s\u00a0\u202f]*%/.test(text.slice(end));
    const pool = isPercent ? allowed.percent : allowed.any;
    if (!pool.some((a) => Math.abs(a - value) <= tolerance)) {
      issues.push({
        code: 'number_mismatch',
        message: `Le chiffre « ${raw.trim()}${isPercent ? ' %' : ''} » ne correspond à aucune donnée de la séance.`,
        path,
      });
    }
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/* Conseils d'investissement                                            */
/* ------------------------------------------------------------------ */

const ADVICE = [
  'achetez',
  'vendez',
  'achète',
  'vends',
  'je vous conseille',
  'je te conseille',
  'vous devriez (?:acheter|vendre)',
  'tu devrais (?:acheter|vendre)',
  'le prix va',
  'les prix vont',
  'va (?:monter|baisser|chuter|exploser)',
  'vont (?:monter|baisser|chuter)',
];
const ADVICE_REGEX = new RegExp(`(?<![\\p{L}])(?:${ADVICE.join('|')})(?![\\p{L}])`, 'iu');

export function checkAdvice(text: string, path: string): ValidationIssue[] {
  return ADVICE_REGEX.test(text)
    ? [{ code: 'forbidden_advice', message: 'Le texte ressemble à un conseil d’investissement ou à une prévision de prix.', path }]
    : [];
}
