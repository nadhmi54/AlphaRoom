import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { Profile } from '../../users/profile.entity.js';
import type { SessionData } from '../contract/session-data.js';
import { SESSION_DATA_PROVIDER, type SessionDataProvider } from '../contract/session-data-provider.js';
import { LLM_PROVIDER, type LlmProvider } from '../llm/llm-provider.js';
import { AiUsage, type UsagePurpose } from '../storage/ai-usage.entity.js';
import { isTeacher, loadSession } from '../sessions/session-access.js';
import type { MarketAnalysisDto, ReplayAnalysisDto } from './ai-analysis.dto.js';
import { analyzeMarket } from './market-analysis.js';
import { narrate, type Narration } from './narration.js';
import { compareRuns } from './replay-analysis.js';

/**
 * Analyses pour l'enseignant : lecture du marché (Market Analyst) et
 * comparaison de deux passages (Replay Analyzer). Les chiffres viennent du
 * code ; le commentaire du modèle, quand il existe, est contrôlé et facultatif.
 */
@Injectable()
export class AiAnalysisService {
  constructor(
    @InjectRepository(AiUsage) private readonly usage: Repository<AiUsage>,
    @Inject(SESSION_DATA_PROVIDER) private readonly sessions: SessionDataProvider,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  async market(profile: Profile, dto: MarketAnalysisDto) {
    this.requireTeacher(profile);
    return this.marketOf(profile, dto, await loadSession(this.sessions, dto.sessionId, dto.run));
  }

  /**
   * Lecture du marché ouverte aux participants de la séance : elle ne contient
   * que des prix, des événements et des comptes (« 3 participants sur 5 »),
   * jamais de noms ni d'ordres individuels.
   */
  async marketForParticipant(profile: Profile, dto: MarketAnalysisDto) {
    const session = await loadSession(this.sessions, dto.sessionId, dto.run);
    if (!isTeacher(profile) && !session.participants.some((p) => p.id === profile.id)) {
      throw new NotFoundException('Tu ne participes pas à cette séance.');
    }
    return this.marketOf(profile, dto, session);
  }

  private async marketOf(profile: Profile, dto: MarketAnalysisDto, session: SessionData) {
    const analysis = analyzeMarket(session);
    const narration = await narrate(this.llm, 'marché', analysis, session.durationMinutes);
    await this.record(profile, 'market_analysis', dto.sessionId, dto.run, narration);
    return { analysis, ...this.commentary(narration) };
  }

  async replay(profile: Profile, dto: ReplayAnalysisDto) {
    this.requireTeacher(profile);
    if (dto.fromRun >= dto.toRun) throw new BadRequestException('Le passage de départ doit précéder le passage d’arrivée.');
    const [before, after] = await Promise.all([
      loadSession(this.sessions, dto.sessionId, dto.fromRun),
      loadSession(this.sessions, dto.sessionId, dto.toRun),
    ]);
    const analysis = compareRuns(before, after);
    // Le modèle ne reçoit que des alias : ni identifiants ni noms.
    const forModel = {
      ...analysis,
      participants: analysis.participants.map(({ participantId: _id, displayName: _name, ...rest }) => rest),
    };
    const narration = await narrate(this.llm, 'replay', forModel, Math.max(before.durationMinutes, after.durationMinutes));
    await this.record(profile, 'replay', dto.sessionId, dto.toRun, narration);
    return { analysis, ...this.commentary(narration) };
  }

  private commentary(narration: Narration) {
    return {
      commentary: narration.commentary,
      commentarySource: narration.source,
      ...(narration.reason ? { commentaryNote: narration.reason } : {}),
    };
  }

  private async record(profile: Profile, purpose: UsagePurpose, sessionId: string, run: number, narration: Narration) {
    if (!narration.usage) return;
    await this.usage.save(
      this.usage.create({
        sessionId,
        run,
        userId: profile.id,
        purpose,
        provider: this.llm.name,
        model: (narration.model ?? 'inconnu').slice(0, 80),
        inputTokens: narration.usage.inputTokens,
        outputTokens: narration.usage.outputTokens,
      }),
    );
  }

  private requireTeacher(profile: Profile) {
    if (!isTeacher(profile)) throw new ForbiddenException('Réservé à l’enseignant.');
  }
}
