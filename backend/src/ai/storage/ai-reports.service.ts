import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { Profile } from '../../users/profile.entity.js';
import { UserRole } from '../../users/user-role.enum.js';
import {
  SESSION_DATA_PROVIDER,
  SessionNotFoundError,
  SessionSourceUnavailableError,
  type SessionDataProvider,
} from '../contract/session-data-provider.js';
import type { SessionData } from '../contract/session-data.js';
import { evaluateParticipant } from '../evaluator/report-evaluator.js';
import { LLM_PROVIDER, type LlmProvider } from '../llm/llm-provider.js';
import { applyReportEdit, ReportEditError, type ReportEdit } from '../report/report-edit.js';
import type { EvaluationReport, ReportTrace } from '../report/report-types.js';
import type { EditReportDto, GenerateReportDto } from '../dto/ai-report.dto.js';
import { AiReport, type ReportStatus } from './ai-report.entity.js';
import { AiReportRevision, type RevisionKind } from './ai-report-revision.entity.js';
import { AiUsage } from './ai-usage.entity.js';

const MAX_PARTICIPANTS = 50;

export interface ReportView {
  id: string;
  sessionId: string;
  run: number;
  alias: string;
  status: ReportStatus;
  published: boolean;
  content: EvaluationReport;
  /** Réservé à l'enseignant : modèle, prompt, empreinte des données, problèmes rencontrés. */
  trace?: ReportTrace;
  /** Réservé à l'enseignant : identifiant du participant. */
  participantId?: string;
  /** Réservé à l'enseignant : nom affiché du participant (jamais transmis à l'IA). */
  displayName?: string;
  validatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const isTeacher = (profile: Profile) => profile.role === UserRole.GAME_MASTER || profile.role === UserRole.ADMIN;

/**
 * Cycle de vie des bilans : génération (brouillon) → corrections de
 * l'enseignant → validation → publication à l'étudiant. Tout changement est
 * historisé. L'étudiant ne voit jamais un brouillon.
 */
@Injectable()
export class AiReportsService {
  constructor(
    @InjectRepository(AiReport) private readonly reports: Repository<AiReport>,
    @InjectRepository(AiReportRevision) private readonly revisions: Repository<AiReportRevision>,
    @InjectRepository(AiUsage) private readonly usage: Repository<AiUsage>,
    @Inject(SESSION_DATA_PROVIDER) private readonly sessions: SessionDataProvider,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  async generate(profile: Profile, dto: GenerateReportDto) {
    this.requireTeacher(profile);
    const session = await this.loadSession(dto.sessionId, dto.run);

    const ids = dto.participantId ? [dto.participantId] : session.participants.map((p) => p.id);
    if (dto.participantId && !session.participants.some((p) => p.id === dto.participantId)) {
      throw new NotFoundException('Participant absent de la séance.');
    }
    if (ids.length > MAX_PARTICIPANTS) throw new BadRequestException(`Au plus ${MAX_PARTICIPANTS} bilans à la fois.`);

    const created: ReportView[] = [];
    const skipped: string[] = [];
    for (const participantId of ids) {
      const existing = await this.reports.findOne({ where: { sessionId: dto.sessionId, run: dto.run, participantId } });
      if (existing?.status === 'validated') {
        // Un bilan validé n'est jamais écrasé en silence.
        skipped.push(existing.alias);
        continue;
      }
      const { report, trace } = await evaluateParticipant({
        session,
        participantId,
        requester: { id: profile.id, role: profile.role },
        provider: this.llm,
      });

      const row = existing ?? this.reports.create({ sessionId: dto.sessionId, run: dto.run, participantId, createdBy: profile.id });
      const before = existing ? existing.content : null;
      row.alias = report.alias;
      row.status = 'draft';
      row.published = false;
      row.content = report;
      row.trace = trace;
      const saved = await this.reports.save(row);

      await this.revisions.save(this.revisions.create({ reportId: saved.id, editorId: profile.id, kind: 'generated', before, after: report }));
      await this.usage.save(
        this.usage.create({
          reportId: saved.id,
          sessionId: dto.sessionId,
          run: dto.run,
          userId: profile.id,
          purpose: 'evaluation',
          provider: trace.provider,
          model: trace.model.slice(0, 80),
          inputTokens: trace.usage.inputTokens,
          outputTokens: trace.usage.outputTokens,
        }),
      );
      created.push(this.toView(saved, true, session.participants.find((p) => p.id === participantId)?.displayName));
    }
    return { reports: created, skippedValidated: skipped };
  }

  async list(profile: Profile, query: { sessionId: string; run: number }): Promise<ReportView[]> {
    const teacher = isTeacher(profile);
    const rows = await this.reports.find({
      where: { sessionId: query.sessionId, run: query.run, ...(teacher ? {} : { participantId: profile.id }) },
      order: { alias: 'ASC' },
    });
    const names = teacher ? await this.namesFor(query.sessionId, query.run) : new Map<string, string>();
    return rows
      .filter((row) => teacher || this.visibleToStudent(row))
      .map((row) => this.toView(row, teacher, names.get(row.participantId)));
  }

  async get(profile: Profile, id: string): Promise<ReportView> {
    const row = await this.reports.findOne({ where: { id } });
    const teacher = isTeacher(profile);
    // Même réponse pour « inexistant » et « pas à toi » : on ne révèle pas l'existence.
    if (!row || (!teacher && (row.participantId !== profile.id || !this.visibleToStudent(row)))) {
      throw new NotFoundException('Bilan introuvable.');
    }
    const names = teacher ? await this.namesFor(row.sessionId, row.run) : new Map<string, string>();
    return this.toView(row, teacher, names.get(row.participantId));
  }

  async edit(profile: Profile, id: string, dto: EditReportDto): Promise<ReportView> {
    this.requireTeacher(profile);
    const row = await this.mustFind(id);
    let next: EvaluationReport;
    try {
      next = applyReportEdit(row.content, dto as ReportEdit);
    } catch (error) {
      if (error instanceof ReportEditError) throw new BadRequestException(error.message);
      throw error;
    }
    const before = row.content;
    row.content = next;
    // Modifier un bilan validé le remet en brouillon et le retire de la vue de l'étudiant.
    row.status = 'draft';
    row.published = false;
    row.validatedAt = null;
    row.validatedBy = null;
    const saved = await this.reports.save(row);
    await this.record(saved.id, profile.id, 'edited', before, next);
    return this.toView(saved, true, (await this.namesFor(saved.sessionId, saved.run)).get(saved.participantId));
  }

  async validate(profile: Profile, id: string, publish: boolean): Promise<ReportView> {
    this.requireTeacher(profile);
    const row = await this.mustFind(id);
    row.status = 'validated';
    row.published = publish;
    row.validatedBy = profile.id;
    row.validatedAt = new Date();
    const saved = await this.reports.save(row);
    await this.record(saved.id, profile.id, publish ? 'validated' : 'unpublished', row.content, row.content);
    return this.toView(saved, true, (await this.namesFor(saved.sessionId, saved.run)).get(saved.participantId));
  }

  async usageSummary(profile: Profile, sessionId?: string) {
    this.requireTeacher(profile);
    const rows = await this.usage.find({ where: sessionId ? { sessionId } : {} });
    return {
      calls: rows.length,
      inputTokens: rows.reduce((sum, r) => sum + r.inputTokens, 0),
      outputTokens: rows.reduce((sum, r) => sum + r.outputTokens, 0),
    };
  }

  /* ---------------------------------------------------------------- */

  private requireTeacher(profile: Profile) {
    if (!isTeacher(profile)) throw new ForbiddenException('Réservé à l’enseignant.');
  }

  private async mustFind(id: string): Promise<AiReport> {
    const row = await this.reports.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Bilan introuvable.');
    return row;
  }

  private visibleToStudent(row: AiReport) {
    return row.status === 'validated' && row.published;
  }

  private async loadSession(sessionId: string, run: number): Promise<SessionData> {
    try {
      return await this.sessions.getSession(sessionId, run);
    } catch (error) {
      if (error instanceof SessionNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof SessionSourceUnavailableError) throw new ServiceUnavailableException(error.message);
      throw error;
    }
  }

  private record(reportId: string, editorId: string, kind: RevisionKind, before: EvaluationReport | null, after: EvaluationReport) {
    return this.revisions.save(this.revisions.create({ reportId, editorId, kind, before, after }));
  }

  /** Noms affichés (enseignant seulement). Si la séance est indisponible, on affiche les alias. */
  private async namesFor(sessionId: string, run: number): Promise<Map<string, string>> {
    try {
      const session = await this.sessions.getSession(sessionId, run);
      return new Map(session.participants.map((p) => [p.id, p.displayName]));
    } catch {
      return new Map();
    }
  }

  private toView(row: AiReport, teacher: boolean, displayName?: string): ReportView {
    return {
      id: row.id,
      sessionId: row.sessionId,
      run: row.run,
      alias: row.alias,
      status: row.status,
      published: row.published,
      content: row.content,
      validatedAt: row.validatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(teacher
        ? { trace: row.trace, participantId: row.participantId, ...(displayName ? { displayName } : {}) }
        : {}),
    };
  }
}
