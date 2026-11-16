/**
 * Interface unique vers un modèle de langage. Tout le reste du module IA ne
 * dépend que d'elle : changer de fournisseur (ou utiliser le stub en test)
 * ne touche ni aux métriques, ni au contexte, ni aux prompts.
 *
 * Deux modes :
 *   - `generate` : texte seulement (bilans, analyses, commentaires) ;
 *   - `generateWithTools` (optionnel) : le modèle peut demander l'exécution d'OUTILS
 *     que le serveur définit. Ces outils sont en lecture seule et limités aux données
 *     de la personne qui pose la question : le modèle ne peut ni passer un ordre, ni
 *     modifier le marché, ni lire la base librement.
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

/** Description d'un outil proposé au modèle (schéma JSON des paramètres). */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Demande d'exécution d'un outil faite par le modèle. */
export interface ToolCall {
  id: string;
  name: string;
  /** Arguments au format JSON, tels que le modèle les a écrits (à valider côté serveur). */
  arguments: string;
}

export type AgentMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ToolRequest {
  system: string;
  messages: AgentMessage[];
  /** Vide : le modèle doit répondre en texte (dernier tour de la boucle). */
  tools: ToolSpec[];
  maxTokens: number;
  temperature?: number;
}

export interface ToolResponse extends LlmResponse {
  toolCalls: ToolCall[];
}

export interface LlmProvider {
  readonly name: string;
  generate(request: LlmRequest): Promise<LlmResponse>;
  /** Absent : le fournisseur ne sait pas appeler d'outils (stub, Anthropic pour l'instant). */
  generateWithTools?(request: ToolRequest): Promise<ToolResponse>;
  /** Comme `generateWithTools`, mais le texte arrive morceau par morceau (`onText`) pendant qu'il s'écrit. */
  streamWithTools?(request: ToolRequest, onText: (delta: string) => void): Promise<ToolResponse>;
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
