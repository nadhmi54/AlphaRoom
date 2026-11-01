/**
 * Interface unique vers un modèle de langage. Tout le reste du module IA ne
 * dépend que d'elle : changer de fournisseur (ou utiliser le stub en test)
 * ne touche ni aux métriques, ni au contexte, ni aux prompts.
 *
 * Le modèle ne reçoit que du texte et ne peut déclencher aucune action :
 * aucun outil, aucun accès à la base ni au moteur de simulation.
 */

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  system: string;
  /** Doit alterner user / assistant et se terminer par un message user. */
  messages: LlmMessage[];
  maxTokens: number;
  /** Basse par défaut : un bilan doit être reproductible. */
  temperature?: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  text: string;
  model: string;
  usage: LlmUsage;
}

export interface LlmProvider {
  readonly name: string;
  generate(request: LlmRequest): Promise<LlmResponse>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
