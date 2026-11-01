import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { Profile } from '../../users/profile.entity.js';
import { UserRole } from '../../users/user-role.enum.js';
import {
  InMemorySessionDataProvider,
  UnconfiguredSessionDataProvider,
  type SessionDataProvider,
} from '../contract/session-data-provider.js';
import { buildPanicTuesday } from '../fixtures/panic-tuesday.js';
import { StubLlmProvider } from '../llm/stub-llm-provider.js';
import type { AiReport } from './ai-report.entity.js';
import type { AiReportRevision } from './ai-report-revision.entity.js';
import type { AiUsage } from './ai-usage.entity.js';
import { AiReportsService } from './ai-reports.service.js';

/** Dépôt en mémoire : assez pour tester les règles métier sans base de données. */
class FakeRepo<T extends { id?: string | number }> {
  rows: T[] = [];
  private counter = 0;
  create(data: Partial<T>): T {
    return { ...data } as T;
  }
  async save(row: T): Promise<T> {
    if (!row.id) {
      this.counter += 1;
      row.id = `id-${this.counter}`;
      (row as { createdAt?: Date }).createdAt = new Date('2026-11-01T10:00:00Z');
      this.rows.push(row);
    }
    (row as { updatedAt?: Date }).updatedAt = new Date('2026-11-01T11:00:00Z');
    return row;
  }
  async findOne(options: { where: Record<string, unknown> }): Promise<T | null> {
    return this.rows.find((r) => Object.entries(options.where).every(([k, v]) => (r as Record<string, unknown>)[k] === v)) ?? null;
  }
  async find(options?: { where?: Record<string, unknown>; order?: Record<string, string> }): Promise<T[]> {
    const where = options?.where ?? {};
    return this.rows.filter((r) => Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v));
  }
}

const profile = (id: string, role: UserRole) => ({ id, role }) as Profile;
const teacher = profile('prof', UserRole.GAME_MASTER);
const sarra = profile('user-sarra', UserRole.TRADER);
const amine = profile('user-amine', UserRole.TRADER);

function build(sessions: SessionDataProvider = new InMemorySessionDataProvider([buildPanicTuesday()])) {
  const reports = new FakeRepo<AiReport>();
  const revisions = new FakeRepo<AiReportRevision>();
  const usage = new FakeRepo<AiUsage>();
  const llm = new StubLlmProvider(() => 'pas du json'); // → texte de secours, déterministe
  const service = new AiReportsService(reports as never, revisions as never, usage as never, sessions, llm);
  return { service, reports, revisions, usage };
}

const dto = { sessionId: 'mardi-panique', run: 1 };

describe('génération', () => {
  it('crée un brouillon par participant, avec historique et consommation', async () => {
    const { service, reports, revisions, usage } = build();
    const out = await service.generate(teacher, dto);

    expect(out.reports).toHaveLength(4);
    expect(out.reports.every((r) => r.status === 'draft' && !r.published)).toBe(true);
    expect(reports.rows).toHaveLength(4);
    expect(revisions.rows.every((r) => r.kind === 'generated')).toBe(true);
    expect(usage.rows).toHaveLength(4);
    expect(usage.rows[0]).toMatchObject({ purpose: 'evaluation', userId: 'prof', provider: 'stub' });
  });

  it('génère un seul bilan quand on désigne un participant', async () => {
    const { service } = build();
    const out = await service.generate(teacher, { ...dto, participantId: 'user-sarra' });
    expect(out.reports).toHaveLength(1);
    expect(out.reports[0]!.alias).toBe('etu_04');
  });

  it('refuse un participant absent de la séance', async () => {
    const { service } = build();
    await expect(service.generate(teacher, { ...dto, participantId: 'inconnu' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('réserve la génération à l’enseignant', async () => {
    const { service } = build();
    await expect(service.generate(sarra, dto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('répond 404 pour une séance inconnue et 503 si la simulation n’est pas branchée', async () => {
    await expect(build().service.generate(teacher, { sessionId: 'nope', run: 1 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(build(new UnconfiguredSessionDataProvider()).service.generate(teacher, dto)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('régénère un brouillon sans en créer un second, et garde l’ancien contenu dans l’historique', async () => {
    const { service, reports, revisions } = build();
    await service.generate(teacher, { ...dto, participantId: 'user-sarra' });
    await service.generate(teacher, { ...dto, participantId: 'user-sarra' });
    expect(reports.rows).toHaveLength(1);
    expect(revisions.rows).toHaveLength(2);
    expect(revisions.rows[1]!.before).not.toBeNull();
  });

  it('n’écrase jamais un bilan validé', async () => {
    const { service, reports } = build();
    const { reports: [first] } = await service.generate(teacher, { ...dto, participantId: 'user-sarra' });
    await service.validate(teacher, first!.id, false);
    const again = await service.generate(teacher, { ...dto, participantId: 'user-sarra' });
    expect(again.reports).toHaveLength(0);
    expect(again.skippedValidated).toEqual(['etu_04']);
    expect(reports.rows[0]!.status).toBe('validated');
  });
});

describe('visibilité', () => {
  async function prepared() {
    const ctx = build();
    const { reports } = await ctx.service.generate(teacher, dto);
    const idOf = (alias: string) => reports.find((r) => r.alias === alias)!.id;
    return { ...ctx, idOf };
  }

  it('l’enseignant voit tout, avec la trace et l’identifiant', async () => {
    const { service } = await prepared();
    const list = await service.list(teacher, dto);
    expect(list).toHaveLength(4);
    expect(list[0]).toHaveProperty('trace');
    expect(list[0]).toHaveProperty('participantId');
  });

  it('un étudiant ne voit rien tant que son bilan est un brouillon', async () => {
    const { service, idOf } = await prepared();
    expect(await service.list(sarra, dto)).toEqual([]);
    await expect(service.get(sarra, idOf('etu_04'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un bilan validé mais non publié reste invisible pour l’étudiant', async () => {
    const { service, idOf } = await prepared();
    await service.validate(teacher, idOf('etu_04'), false);
    expect(await service.list(sarra, dto)).toEqual([]);
  });

  it('un bilan publié est visible par son étudiant, sans trace ni identifiant', async () => {
    const { service, idOf } = await prepared();
    await service.validate(teacher, idOf('etu_04'), true);
    const mine = await service.list(sarra, dto);
    expect(mine).toHaveLength(1);
    expect(mine[0]).not.toHaveProperty('trace');
    expect(mine[0]).not.toHaveProperty('participantId');
    expect(mine[0]!.content.alias).toBe('etu_04');
  });

  it('un étudiant ne peut pas lire le bilan d’un autre, même publié', async () => {
    const { service, idOf } = await prepared();
    await service.validate(teacher, idOf('etu_04'), true);
    await expect(service.get(amine, idOf('etu_04'))).rejects.toBeInstanceOf(NotFoundException);
    expect(await service.list(amine, dto)).toEqual([]);
  });
});

describe('corrections et validation', () => {
  it('modifie un brouillon et historise avant / après', async () => {
    const { service, revisions } = build();
    const { reports: [draft] } = await service.generate(teacher, { ...dto, participantId: 'user-amine' });
    const edited = await service.edit(teacher, draft!.id, { summary: 'Revu en classe.', criteria: [{ id: 'gestion_risque', teacherScore: 3 }] });
    expect(edited.content.summary).toBe('Revu en classe.');
    expect(edited.content.criteria.find((c) => c.id === 'gestion_risque')).toMatchObject({ score: 1, teacherScore: 3 });
    const last = revisions.rows.at(-1)!;
    expect(last.kind).toBe('edited');
    expect(last.before!.summary).not.toBe('Revu en classe.');
    expect(last.editorId).toBe('prof');
  });

  it('refuse une correction invalide avec une erreur 400', async () => {
    const { service } = build();
    const { reports: [draft] } = await service.generate(teacher, { ...dto, participantId: 'user-amine' });
    await expect(service.edit(teacher, draft!.id, { criteria: [{ id: 'gestion_risque', teacherScore: 9 }] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('retire de la vue de l’étudiant un bilan publié qu’on modifie', async () => {
    const { service } = build();
    const { reports: [draft] } = await service.generate(teacher, { ...dto, participantId: 'user-sarra' });
    await service.validate(teacher, draft!.id, true);
    expect(await service.list(sarra, dto)).toHaveLength(1);

    const edited = await service.edit(teacher, draft!.id, { summary: 'Nouvelle version.' });
    expect(edited).toMatchObject({ status: 'draft', published: false });
    expect(await service.list(sarra, dto)).toEqual([]);
  });

  it('enregistre qui a validé, quand, et distingue validation et publication', async () => {
    const { service, revisions } = build();
    const { reports: [draft] } = await service.generate(teacher, { ...dto, participantId: 'user-sarra' });
    const validated = await service.validate(teacher, draft!.id, true);
    expect(validated).toMatchObject({ status: 'validated', published: true });
    expect(validated.validatedAt).toBeInstanceOf(Date);
    expect(revisions.rows.at(-1)!.kind).toBe('validated');
    await service.validate(teacher, draft!.id, false);
    expect(revisions.rows.at(-1)!.kind).toBe('unpublished');
  });

  it('réserve édition et validation à l’enseignant', async () => {
    const { service } = build();
    const { reports: [draft] } = await service.generate(teacher, { ...dto, participantId: 'user-sarra' });
    await expect(service.edit(sarra, draft!.id, { summary: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.validate(sarra, draft!.id, true)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.validate(teacher, 'inexistant', true)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('consommation', () => {
  it('additionne les appels et les tokens, pour l’enseignant seulement', async () => {
    const { service } = build();
    await service.generate(teacher, dto);
    const summary = await service.usageSummary(teacher, 'mardi-panique');
    expect(summary.calls).toBe(4);
    expect(summary.inputTokens).toBeGreaterThan(0);
    await expect(service.usageSummary(sarra)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
