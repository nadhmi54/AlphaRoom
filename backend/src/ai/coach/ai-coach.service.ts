import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { Profile } from '../../users/profile.entity.js';
import {
  AiAccessError,
  buildParticipantContext,
  resolveAlias,
  type ParticipantContext,
} from '../context/ai-context.js';
import { hashValue } from '../context/stable-json.js';
import { SESSION_DATA_PROVIDER, type SessionDataProvider } from '../contract/session-data-provider.js';
import type { SessionData } from '../contract/session-data.js';
import { LLM_PROVIDER, LlmError, type LlmProvider } from '../llm/llm-provider.js';
import type { Evidence } from '../metrics/metrics.js';
import { buildCoachRequest, PROMPT_VERSION } from '../prompts/prompts.js';
import { AiUsage } from '../storage/ai-usage.entity.js';
import { isTeacher, listVisibleSessions, loadSession } from '../sessions/session-access.js';
import { buildRuleAnswer, validateCoachText } from './coach-answer.js';
import type { AskCoachDto } from './ai-coach.dto.js';
import { SlidingWindowLimiter } from './rate-limiter.js';

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
}

const NOTICE = 'Le coach explique, il ne prédit pas les prix et ne donne pas de conseil d’investissement.';

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
    { windowMs: 60_000, max: 6 },
    { windowMs: 3_600_000, max: 60 },
  ]);

  constructor(
    @InjectRepository(AiUsage) private readonly usage: Repository<AiUsage>,
    @Inject(SESSION_DATA_PROVIDER) private readonly sessions: SessionDataProvider,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  async ask(profile: Profile, dto: AskCoachDto): Promise<CoachReply> {
    const limit = this.limiter.hit(profile.id);
    if (!limit.ok) {
      const seconds = Math.ceil(limit.retryAfterMs / 1000);
      throw new HttpException(
        `Trop de questions d’affilée. Réessaie dans ${seconds} seconde${seconds > 1 ? 's' : ''}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const { session, participantId } = await this.resolve(profile, dto);
    let context: ParticipantContext;
    try {
      context = buildParticipantContext(session, participantId, { id: profile.id, role: profile.role });
    } catch (error) {
      if (error instanceof AiAccessError) throw new NotFoundException('Tu ne participes pas à cette séance.');
      throw error;
    }
    const contextHash = hashValue(context);
    const base = { sessionId: session.sessionId, run: session.run, promptVersion: PROMPT_VERSION, contextHash, notice: NOTICE };

    const rules = buildRuleAnswer(context, dto.question);
    // Sans modèle configuré : réponse du code, rien ne part vers l'extérieur.
    if (this.llm.name === 'stub') return { ...base, answer: rules.text, source: 'rules', evidence: rules.evidence };

    try {
      const request = buildCoachRequest({ context, question: dto.question, history: dto.history });
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
        await this.usage.save(
          this.usage.create({
            sessionId: session.sessionId,
            run: session.run,
            userId: profile.id,
            purpose: 'coach',
            provider: this.llm.name,
            model: response.model.slice(0, 80),
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
          }),
        );
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

  /** Trouve la séance, le passage et le participant concernés. */
  private async resolve(profile: Profile, dto: AskCoachDto): Promise<{ session: SessionData; participantId: string }> {
    let sessionId = dto.sessionId;
    let run = dto.run;
    if (!sessionId) {
      const visible = await listVisibleSessions(this.sessions, profile);
      const target = visible.find((s) => s.joined) ?? (isTeacher(profile) ? visible[0] : undefined);
      if (!target) throw new NotFoundException('Tu ne participes à aucune séance pour le moment.');
      sessionId = target.sessionId;
      run ??= target.latestRun;
    }
    if (run === undefined) {
      const visible = await listVisibleSessions(this.sessions, profile).catch(() => []);
      run = visible.find((s) => s.sessionId === sessionId)?.latestRun ?? 1;
    }
    const session = await loadSession(this.sessions, sessionId, run);

    if (dto.alias) {
      if (!isTeacher(profile)) throw new NotFoundException('Tu ne participes pas à cette séance.');
      const participantId = resolveAlias(session, dto.alias);
      if (!participantId) throw new NotFoundException('Participant introuvable dans la séance.');
      return { session, participantId };
    }
    return { session, participantId: profile.id };
  }
}
