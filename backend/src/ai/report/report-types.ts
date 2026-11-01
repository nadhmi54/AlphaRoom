import type { Evidence } from '../metrics/metrics.js';
import type { CriterionScore, OverallScore } from '../rubric/rubric.js';

/** Un point fort ou une piste d'amélioration, toujours accompagné de preuves. */
export interface ReportPoint {
  text: string;
  evidence: Evidence[];
}

/** Critère du rapport : note et règle viennent du code, le commentaire du modèle (ou du code en secours). */
export interface ReportCriterion extends CriterionScore {
  comment: string;
  commentEvidence: Evidence[];
  /** Note corrigée par l'enseignant : remplace `score` dans le calcul de la moyenne. */
  teacherScore?: number | null;
}

/** Contenu d'un bilan individuel. Aucun nom ni identifiant interne : seulement l'alias. */
export interface EvaluationReport {
  alias: string;
  session: { id: string; run: number };
  rubric: { id: string; version: string; outOf: number };
  criteria: ReportCriterion[];
  overall: OverallScore;
  summary: string;
  strengths: ReportPoint[];
  improvements: ReportPoint[];
  /** Informations que le système n'a pas pu obtenir : affichées telles quelles. */
  missingData: string[];
}

export interface ValidationIssue {
  code:
    | 'invalid_json'
    | 'invalid_shape'
    | 'unknown_criterion'
    | 'duplicate_criterion'
    | 'missing_criterion'
    | 'missing_evidence'
    | 'unknown_evidence'
    | 'number_mismatch'
    | 'forbidden_advice'
    | 'too_long'
    | 'llm_unavailable';
  message: string;
  path?: string;
}

/** Trace complète : de quoi retrouver d'où vient un rapport et le régénérer. */
export interface ReportTrace {
  /** 'llm' : texte rédigé par le modèle et validé. 'rules' : texte généré par le code (secours). */
  source: 'llm' | 'rules';
  provider: string;
  model: string;
  promptVersion: string;
  rubricVersion: string;
  contextHash: string;
  temperature: number;
  attempts: number;
  usage: { inputTokens: number; outputTokens: number };
  generatedAt: string;
  /** Problèmes rencontrés pendant la génération (même si une nouvelle tentative a réussi). */
  issues: ValidationIssue[];
}

/** Ce que le modèle doit renvoyer : du texte et des références, jamais de notes. */
export interface LlmReportParts {
  summary: string;
  criteria: Array<{ id: string; comment: string; evidence: Evidence[] }>;
  strengths: ReportPoint[];
  improvements: ReportPoint[];
}
