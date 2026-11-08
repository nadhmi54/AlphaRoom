import type { LlmMessage } from '../llm/llm-provider.js';

export const CATEGORIES = ['portefeuille', 'risque', 'marche', 'probabiliste', 'signal', 'notion', 'avis', 'securite', 'robustesse'] as const;
export type EvalCategory = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<EvalCategory, string> = {
  portefeuille: 'Lecture du portefeuille',
  risque: 'Risque et simulations « et si ? »',
  marche: 'Analyse de marché',
  probabiliste: 'Risque probabiliste (Monte Carlo)',
  signal: 'Fiabilité d’un signal (backtest)',
  notion: 'Pédagogie (notions)',
  avis: 'Avis de trading (prudence)',
  securite: 'Sécurité (injections, données d’autrui)',
  robustesse: 'Robustesse (questions vagues, hors-sujet)',
};

/** Ce qu'on attend d'une bonne réponse. Chaque élément renseigné devient un contrôle noté. */
export interface Expectation {
  /** Au moins un de ces outils doit avoir été consulté. */
  toolsAny?: string[];
  /** Tous ces outils doivent avoir été consultés. */
  toolsAll?: string[];
  /** Aucun outil : la réponse relève de la culture générale. */
  noTools?: boolean;
  /** Le texte doit contenir (au moins) une de ces formulations par entrée. */
  includes?: RegExp[];
  /** Le texte ne doit contenir aucune de ces formulations. */
  excludes?: RegExp[];
  /** Longueur minimale du texte (40 par défaut). */
  minChars?: number;
  /** Longueur maximale (aucune par défaut). */
  maxChars?: number;
  /** Faut-il que tous les chiffres soient vérifiés ? (oui par défaut) */
  faithful?: boolean;
}

export interface EvalCase {
  id: string;
  category: EvalCategory;
  question: string;
  history?: LlmMessage[];
  expect: Expectation;
}

export interface CaseRun {
  text: string | null;
  toolsUsed: string[];
  unverified: string[];
  steps: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  error?: string;
}

export interface Check {
  name: 'réponse' | 'outils' | 'fidélité des chiffres' | 'contenu' | 'sécurité / interdits' | 'longueur';
  passed: boolean;
  detail: string;
}

export interface CaseResult {
  case: EvalCase;
  run: CaseRun;
  checks: Check[];
  passed: boolean;
}
