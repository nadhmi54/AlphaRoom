import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { EvaluationReport } from '../report/report-types.js';

export type RevisionKind = 'generated' | 'edited' | 'validated' | 'unpublished';

/** Historique des changements d'un bilan : qui a modifié quoi, avant et après. */
@Entity({ name: 'ai_report_revisions' })
export class AiReportRevision {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id!: string;

  @Column({ name: 'report_id', type: 'uuid' }) reportId!: string;

  @Column({ name: 'editor_id', type: 'uuid', nullable: true }) editorId!: string | null;

  @Column({ type: 'varchar', length: 12 }) kind!: RevisionKind;

  @Column({ type: 'jsonb', nullable: true }) before!: EvaluationReport | null;

  @Column({ type: 'jsonb' }) after!: EvaluationReport;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
