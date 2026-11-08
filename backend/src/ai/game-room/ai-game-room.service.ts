import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Profile } from '../../users/profile.entity.js';
import { AiAnalysisService } from '../analysis/ai-analysis.service.js';
import { AiCoachService } from '../coach/ai-coach.service.js';
import { SESSION_DATA_PROVIDER, type SessionDataProvider } from '../contract/session-data-provider.js';
import { listVisibleSessions } from '../sessions/session-access.js';
import { AiReportsService } from '../storage/ai-reports.service.js';

/**
 * Façade « une salle » pour la Game Room : les trois routes
 * `/game-room/:roomId/ai/*` passent par ici et utilisent le vrai module IA
 * (chiffres calculés par le code, contrôle des réponses, validation par
 * l'enseignant). Le passage utilisé est toujours le dernier.
 */
@Injectable()
export class AiGameRoomService {
  constructor(
    @Inject(SESSION_DATA_PROVIDER) private readonly sessions: SessionDataProvider,
    @Inject(AiCoachService) private readonly coach: AiCoachService,
    @Inject(AiAnalysisService) private readonly analysis: AiAnalysisService,
    @Inject(AiReportsService) private readonly reports: AiReportsService,
  ) {}

  /** Market Analyst : lecture du marché de la salle, avec commentaire contrôlé. */
  async analyst(profile: Profile, roomId: string) {
    const run = await this.latestRun(profile, roomId);
    const result = await this.analysis.marketForParticipant(profile, { sessionId: roomId, run });
    return { role: 'AI Market Analyst', sessionId: roomId, run, ...result };
  }

  /** Trading Coach : réponse construite sur les ordres réels de l'étudiant. */
  async askCoach(profile: Profile, roomId: string, question: string, history?: Array<{ role: 'user' | 'assistant'; content: string }>) {
    const run = await this.latestRun(profile, roomId);
    const reply = await this.coach.ask(profile, { question: question ?? '', sessionId: roomId, run, history });
    return { role: 'AI Trading Coach', question, ...reply };
  }

  /** Performance Evaluator : les bilans de l'étudiant, une fois validés et publiés par l'enseignant (tous les passages, du plus récent au plus ancien). */
  async evaluation(profile: Profile, roomId: string) {
    const session = await this.visibleSession(profile, roomId);
    const reports = (
      await Promise.all(session.runs.map((run) => this.reports.list(profile, { sessionId: roomId, run })))
    )
      .flat()
      .sort((a, b) => b.run - a.run);
    return {
      role: 'AI Performance Evaluator',
      sessionId: roomId,
      run: session.latestRun,
      reports,
      message:
        reports.length === 0
          ? 'Ton bilan n’est pas encore publié : ton enseignant le relit et le valide avant de te le montrer.'
          : undefined,
    };
  }

  private async visibleSession(profile: Profile, roomId: string) {
    const visible = await listVisibleSessions(this.sessions, profile);
    const found = visible.find((s) => s.sessionId === roomId);
    if (!found) throw new NotFoundException('Salle introuvable, ou tu n’y participes pas.');
    return found;
  }

  private async latestRun(profile: Profile, roomId: string): Promise<number> {
    return (await this.visibleSession(profile, roomId)).latestRun;
  }
}
