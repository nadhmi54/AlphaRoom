import {
  AiAccessError,
  buildParticipantContext,
  type ContextOptions,
  type ParticipantContext,
  type Requester,
} from '../context/ai-context.js';
import { hashValue } from '../context/stable-json.js';
import type { SessionData } from '../contract/session-data.js';
import { LlmError, type LlmMessage, type LlmProvider, type LlmUsage } from '../llm/llm-provider.js';
import { computeMetrics } from '../metrics/metrics.js';
import { buildFallbackParts } from '../report/fallback-report.js';
import { validateReportParts } from '../report/report-validator.js';
import type {
  EvaluationReport,
  LlmReportParts,
  ReportCriterion,
  ReportTrace,
  ValidationIssue,
} from '../report/report-types.js';
import { DEFAULT_RUBRIC, scoreParticipant, type Rubric } from '../rubric/rubric.js';
import { UserRole } from '../../users/user-role.enum.js';
import { buildEvaluatorRequest, buildRetryMessage, EVALUATOR_PROMPT_VERSION } from './evaluator-prompt.js';

export interface EvaluateInput {
  session: SessionData;
  participantId: string;
  requester: Requester;
  provider: LlmProvider;
  rubric?: Rubric;
  /** Nombre maximal d'appels au modèle (1 = pas de nouvelle tentative). */
  maxAttempts?: number;
  contextOptions?: ContextOptions;
  now?: () => Date;
}

export interface EvaluationResult {
  report: EvaluationReport;
  trace: ReportTrace;
}

const TEMPERATURE = 0.2;

/**
 * Produit le brouillon de bilan d'un participant.
 *
 * Ordre des opérations (chaque étape est du code, sauf la rédaction) :
 *   métriques → notes selon le barème → contexte filtré → rédaction par le
 *   modèle → validation (schéma, preuves, chiffres, conseils) → nouvelle
 *   tentative si refus → texte de secours généré par le code si échec.
 * Les notes ne viennent JAMAIS du modèle.
 */
export async function evaluateParticipant(input: EvaluateInput): Promise<EvaluationResult> {
  const { session, participantId, requester, provider } = input;
  if (requester.role !== UserRole.GAME_MASTER && requester.role !== UserRole.ADMIN) {
    throw new AiAccessError('Seul un enseignant peut générer un bilan.');
  }
  const rubric = input.rubric ?? DEFAULT_RUBRIC;
  const maxAttempts = Math.max(1, input.maxAttempts ?? 2);
  const now = input.now ?? (() => new Date());

  const context = buildParticipantContext(session, participantId, requester, input.contextOptions);
  const metrics = computeMetrics(session, participantId);
  const { criteria: scores, overall } = scoreParticipant(metrics, rubric);
  const request = buildEvaluatorRequest({ context, criteria: scores });

  const issues: ValidationIssue[] = [];
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
  const messages: LlmMessage[] = [...request.messages];
  let parts: LlmReportParts | undefined;
  let model = 'none';
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts && !parts; attempt += 1) {
    attempts = attempt;
    try {
      const response = await provider.generate({ ...request, messages });
      model = response.model;
      usage.inputTokens += response.usage.inputTokens;
      usage.outputTokens += response.usage.outputTokens;
      const result = validateReportParts(response.text, context, scores, overall);
      if (result.ok) {
        parts = result.parts;
      } else {
        issues.push(...result.issues);
        messages.push({ role: 'assistant', content: response.text }, { role: 'user', content: buildRetryMessage(result.issues) });
      }
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      issues.push({ code: 'llm_unavailable', message: error.message });
      break;
    }
  }

  const source: ReportTrace['source'] = parts ? 'llm' : 'rules';
  const finalParts = parts ?? buildFallbackParts(scores, overall);

  const trace: ReportTrace = {
    source,
    provider: provider.name,
    model,
    promptVersion: EVALUATOR_PROMPT_VERSION,
    rubricVersion: `${rubric.id}@${rubric.version}`,
    contextHash: hashValue(context),
    temperature: TEMPERATURE,
    attempts,
    usage,
    generatedAt: now().toISOString(),
    issues,
  };

  return { report: assembleReport(context, rubric, scores, overall, finalParts, metrics.missingData), trace };
}

function assembleReport(
  context: ParticipantContext,
  rubric: Rubric,
  scores: ReturnType<typeof scoreParticipant>['criteria'],
  overall: ReturnType<typeof scoreParticipant>['overall'],
  parts: LlmReportParts,
  missingData: string[],
): EvaluationReport {
  const byId = new Map(parts.criteria.map((c) => [c.id, c]));
  const criteria: ReportCriterion[] = scores.map((score) => {
    const written = byId.get(score.id);
    return {
      ...score,
      comment: written?.comment ?? (score.status === 'evaluated' ? score.rule : (score.reason ?? score.rule)),
      commentEvidence: written?.evidence ?? [],
    };
  });
  return {
    alias: context.participant.alias,
    session: { id: context.session.id, run: context.session.run },
    rubric: { id: rubric.id, version: rubric.version, outOf: rubric.outOf },
    criteria,
    overall,
    summary: parts.summary,
    strengths: parts.strengths,
    improvements: parts.improvements,
    missingData,
  };
}
