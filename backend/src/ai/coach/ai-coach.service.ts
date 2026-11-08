import { HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { Profile } from '../../users/profile.entity.js';
import { AiAccessError, buildParticipantContext, type ParticipantContext } from '../context/ai-context.js';
import { hashValue } from '../context/stable-json.js';
import { SESSION_DATA_PROVIDER, type SessionDataProvider } from '../contract/session-data-provider.js';
import { LLM_PROVIDER, LlmError, type LlmProvider } from '../llm/llm-provider.js';
import type { Evidence } from '../metrics/metrics.js';
import { buildCoachRequest, PROMPT_VERSION } from '../prompts/prompts.js';
import { AiUsage } from '../storage/ai-usage.entity.js';
import { resolveSessionFor } from '../sessions/resolve-session.js';
import { AgentMemory } from '../agent/agent-memory.js';
import { buildToolbox } from '../agent/agent-tools.js';
import { runCoachAgent } from '../agent/coach-agent.js';
import { MarketAnalysisService } from '../market/market-analysis.service.js';
import { AiConversationsService } from './ai-conversations.service.js';
import { wrapUntrusted } from '../prompts/prompts.js';
import { currentMinute } from '../agent/live-state.js';
import { buildRuleAnswer, validateCoachText } from './coach-answer.js';
import type { AskCoachDto } from './ai-coach.dto.js';
import { SlidingWindowLimiter } from './rate-limiter.js';

/** Ce que le serveur envoie pendant qu'une réponse s'écrit. */
export type CoachStreamEvent =
  | { type: 'conversation'; id: string; title: string }
  | { type: 'tool'; name: string }
  | { type: 'delta'; text: string }
  /** Le texte déjà montré est abandonné (l'agent se corrige) : repartir de zéro. */
  | { type: 'reset' }
  | { type: 'done'; reply: CoachReply }
  | { type: 'error'; status: number; message: string };

export interface CoachHooks {
  onEvent?: (event: CoachStreamEvent) => void;
}

export interface CoachReply {
  answer: string;
  /** « llm » : texte du modèle, contrôlé. « rules » : texte construit par le code. */
  source: 'llm' | 'rules';
  /** Si le texte du modèle a été refusé, pourquoi (affiché dans la trace de l'enseignant, pas à l'étudiant). */
  fallbackReason?: string;
  evidence: Evidence[];
  sessionId: string;
  run: number;
  promptVersion: string;
  contextHash: string;
  /** Rappel affiché sous chaque réponse. */
  notice: string;
  /** Vrai si la réponse vient de l'agent (le modèle a consulté des outils avant de répondre). */
  agent?: boolean;
  /** Outils consultés par l'agent pour répondre. */
  toolsUsed?: string[];
  /** Chiffres de la réponse que le contrôle n'a pas pu rattacher aux données (à signaler à l'étudiant). */
  unverified?: string[];
  /** Discussion à laquelle cet échange a été ajouté (créée au premier message). */
  conversationId?: string;
}

const describe = (error: unknown) => (error instanceof Error ? (error.stack ?? error.message) : String(error));

const NOTICE = 'Simulation pédagogique : les avis du coach ne sont pas des conseils financiers et rien n’est garanti.';

/**
 * Trading Coach : répond à l'étudiant avec SES données uniquement.
 *
 * Garde-fous, dans l'ordre : limite de questions → contexte filtré par rôle
 * (un trader ne voit que lui) → modèle sans outil ni écriture → contrôle de la
 * réponse (chiffres réels, aucun conseil, longueur) → texte du code en secours.
 */
@Injectable()
export class AiCoachService {
  private readonly limiter = new SlidingWindowLimiter([
    { windowMs: 60_000, max: 20 },
    { windowMs: 3_600_000, max: 300 },
  ]);

  constructor(
    @InjectRepository(AiUsage) private readonly usage: Repository<AiUsage>,
    @Inject(SESSION_DATA_PROVIDER) private readonly sessions: SessionDataProvider,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Optional() @Inject(AgentMemory) memory?: AgentMemory,
    @Optional() private readonly market?: MarketAnalysisService,
    @Optional() private readonly conversations?: AiConversationsService,
  ) {
    this.memory = memory ?? new AgentMemory();
  }

  private readonly memory: AgentMemory;
  private readonly logger = new Logger(AiCoachService.name);

  /** Comme `ask`, mais la réponse s'écrit en direct : les événements sont transmis à `emit`. */
  async stream(profile: Profile, dto: AskCoachDto, emit: (event: CoachStreamEvent) => void): Promise<void> {
    try {
      const reply = await this.ask(profile, dto, { onEvent: emit });
      emit({ type: 'done', reply });
    } catch (error) {
      if (error instanceof HttpException) {
        const response = error.getResponse();
        const message = typeof response === 'string' ? response : (response as { message?: string | string[] }).message;
        emit({ type: 'error', status: error.getStatus(), message: Array.isArray(message) ? message.join(' ') : (message ?? error.message) });
        return;
      }
      this.logger.error(`Coach : ${describe(error)}`);
      emit({ type: 'error', status: 500, message: 'Le coach a rencontré un problème. Réessaie dans un instant.' });
    }
  }

  async ask(profile: Profile, dto: AskCoachDto, hooks: CoachHooks = {}): Promise<CoachReply> {
    const limit = this.limiter.hit(profile.id);
    if (!limit.ok) {
      const seconds = Math.ceil(limit.retryAfterMs / 1000);
      throw new HttpException(
        `Trop de questions d’affilée. Réessaie dans ${seconds} seconde${seconds > 1 ? 's' : ''}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const store = this.conversations;
    if (!store) return this.reply(profile, dto, hooks, dto.history, null);

    // Discussion existante : le serveur relit lui-même son historique (le coach « se souvient »).
    // L'enregistrement est « au mieux » : si la base des discussions est indisponible (table absente,
    // panne…), le coach répond quand même, simplement sans garder la discussion.
    let conversationId = dto.conversationId;
    let history = dto.history;
    let summary: string | null = null;
    let created = false;
    let storeUsable = true;
    if (conversationId) {
      try {
        const past = await store.history(profile.id, conversationId);
        history = past.messages;
        summary = past.summary;
      } catch (error) {
        if (error instanceof HttpException) throw error; // introuvable (404) ou discussion trop longue (400)
        this.logger.error(`Discussions indisponibles (lecture) : ${describe(error)}`);
        storeUsable = false;
        conversationId = undefined;
      }
    }
    let reply: CoachReply;
    try {
      reply = await this.reply(profile, dto, hooks, history, summary, async (sessionId) => {
        // Nouvelle discussion : créée dès que la question est valide, pour que l'écran connaisse son identifiant.
        if (conversationId || !storeUsable) return;
        try {
          const conversation = await store.create(profile.id, { title: dto.question, sessionId });
          conversationId = conversation.id;
          created = true;
          hooks.onEvent?.({ type: 'conversation', id: conversation.id, title: conversation.title });
        } catch (error) {
          this.logger.error(`Discussions indisponibles (création) : ${describe(error)}`);
          storeUsable = false;
        }
      });
    } catch (error) {
      // La question a échoué : on retire la discussion créée pour elle seule.
      if (created && conversationId) await store.remove(profile.id, conversationId).catch(() => undefined);
      throw error;
    }
    if (!conversationId) return reply;
    try {
      await store.append(profile.id, conversationId, [
        { role: 'user', content: dto.question },
        {
          role: 'assistant',
          content: reply.answer,
          meta: {
            source: reply.source,
            ...(reply.toolsUsed?.length ? { toolsUsed: reply.toolsUsed } : {}),
            ...(reply.unverified?.length ? { unverified: reply.unverified } : {}),
            sessionId: reply.sessionId,
            run: reply.run,
            evidence: reply.evidence,
          },
        },
      ]);
    } catch (error) {
      this.logger.error(`Discussions indisponibles (enregistrement) : ${describe(error)}`);
      // Une discussion créée pour cette seule question, restée vide : on la retire.
      if (created) await store.remove(profile.id, conversationId).catch(() => undefined);
      return reply;
    }
    this.summarizeInBackground(profile, conversationId, reply);
    return { ...reply, conversationId };
  }

  /** Résume les anciens messages sans faire attendre la réponse (au mieux : une panne ne casse rien). */
  private summarizeInBackground(profile: Profile, conversationId: string, reply: CoachReply): void {
    if (!this.conversations || this.llm.name === 'stub') return;
    void this.conversations
      .summarizeIfNeeded(profile.id, conversationId, this.llm)
      .then((used) => (used ? this.recordUsage(profile, { sessionId: reply.sessionId, run: reply.run }, used.model, used.usage) : undefined))
      .catch(() => undefined);
  }

  private async reply(
    profile: Profile,
    dto: AskCoachDto,
    hooks: CoachHooks,
    history: AskCoachDto['history'],
    summary: string | null,
    onResolved?: (sessionId: string) => Promise<void>,
  ): Promise<CoachReply> {
    const { session, participantId } = await this.resolve(profile, dto);
    let context: ParticipantContext;
    try {
      context = buildParticipantContext(session, participantId, { id: profile.id, role: profile.role });
    } catch (error) {
      if (error instanceof AiAccessError) throw new NotFoundException('Tu ne participes pas à cette séance.');
      throw error;
    }
    await onResolved?.(session.sessionId);
    const contextHash = hashValue(context);
    const base = { sessionId: session.sessionId, run: session.run, promptVersion: PROMPT_VERSION, contextHash, notice: NOTICE };

    const rules = buildRuleAnswer(context, dto.question);
    // Sans modèle configuré : réponse du code, rien ne part vers l'extérieur.
    if (this.llm.name === 'stub') return { ...base, answer: rules.text, source: 'rules', evidence: rules.evidence };

    // Mode agent : le modèle consulte lui-même les outils (portefeuille, marché, news…) avant de répondre.
    if (this.llm.generateWithTools) {
      const memoryKey = AgentMemory.key(session.sessionId, session.run, participantId);
      try {
        const result = await runCoachAgent({
          llm: this.llm,
          toolbox: buildToolbox({ session, participantId, memory: () => this.memory.summary(memoryKey), ...(this.market ? { market: this.market } : {}) }),
          question: dto.question,
          history,
          ...(summary ? { summary } : {}),
          durationMinutes: session.durationMinutes,
          ...(hooks.onEvent
            ? {
                onText: (text: string) => hooks.onEvent!({ type: 'delta', text }),
                onTool: (name: string) => hooks.onEvent!({ type: 'tool', name }),
                onReplace: () => hooks.onEvent!({ type: 'reset' }),
              }
            : {}),
        });
        await this.recordUsage(profile, session, result.model, result.usage);
        this.memory.rememberQuestion(memoryKey, currentMinute(session), dto.question);
        if (result.text) {
          return {
            ...base,
            answer: result.text,
            source: 'llm',
            agent: true,
            toolsUsed: result.toolsUsed,
            ...(result.unverified.length > 0 ? { unverified: result.unverified } : {}),
            evidence: result.evidence.length > 0 ? result.evidence : rules.evidence,
          };
        }
        // Texte refusé par le contrôle : on tente le chemin classique ci-dessous (contexte complet, sans outils).
      } catch (error) {
        if (!(error instanceof LlmError)) throw error;
        // Le fournisseur n'a pas géré les outils (ou est tombé) : chemin classique ci-dessous.
      }
    }

    try {
      const request = buildCoachRequest({
        context,
        question: dto.question,
        history: summary
          ? [{ role: 'user', content: wrapUntrusted('resume_discussion', summary) }, { role: 'assistant', content: 'Bien noté.' }, ...(history ?? [])]
          : history,
      });
      let lastIssues = '';
      // Deux essais : si le contrôle refuse la première réponse, on la redemande une fois en disant pourquoi.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const messages = [...request.messages];
        if (attempt > 0) {
          const last = messages[messages.length - 1]!;
          messages[messages.length - 1] = {
            ...last,
            content:
              `${last.content}\n\nTa réponse précédente a été refusée par le contrôle (${lastIssues}). ` +
              'Réécris-la : n’utilise que des chiffres présents dans le contexte (ou aucun), et aucun conseil d’achat ou de vente.',
          };
        }
        const response = await this.llm.generate({ ...request, messages });
        await this.recordUsage(profile, session, response.model, response.usage);
        const issues = validateCoachText(response.text, context);
        if (issues.length === 0) {
          return { ...base, answer: response.text.trim(), source: 'llm', evidence: rules.evidence };
        }
        lastIssues = issues.map((i) => i.message).join(' ');
      }
      return { ...base, answer: rules.text, source: 'rules', fallbackReason: lastIssues, evidence: rules.evidence };
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      return { ...base, answer: rules.text, source: 'rules', fallbackReason: 'Modèle indisponible.', evidence: rules.evidence };
    }
  }

  private async recordUsage(profile: Profile, session: { sessionId: string; run: number }, model: string, usage: { inputTokens: number; outputTokens: number }) {
    await this.usage.save(
      this.usage.create({
        sessionId: session.sessionId,
        run: session.run,
        userId: profile.id,
        purpose: 'coach',
        provider: this.llm.name,
        model: model.slice(0, 80),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      }),
    );
  }

  /** Trouve la séance, le passage et le participant concernés. */
  private resolve(profile: Profile, dto: AskCoachDto) {
    return resolveSessionFor(this.sessions, profile, dto);
  }
}
