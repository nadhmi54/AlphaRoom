import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { EvaluationReport, ReportTrace } from '../report/report-types.js';

export type ReportStatus = 'draft' | 'validated';

/**
 * Bilan individuel d'une séance. Un seul bilan par (séance, passage,
 * participant). `session_id` et `participant_id` sont du texte, sans clé
 * étrangère : la simulation (autre module) en est propriétaire.
 */
@Entity({ name: 'ai_reports' })
export class AiReport {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'session_id', type: 'text' }) sessionId!: string;

  @Column({ type: 'integer' }) run!: number;

  @Column({ name: 'participant_id', type: 'text' }) participantId!: string;

  @Column({ type: 'varchar', length: 16 }) alias!: string;

  @Column({ type: 'varchar', length: 12, default: 'draft' }) status!: ReportStatus;

  /** Visible par l'étudiant : seulement si le bilan est validé ET publié. */
  @Column({ type: 'boolean', default: false }) published!: boolean;

  @Column({ type: 'jsonb' }) content!: EvaluationReport;

  @Column({ type: 'jsonb' }) trace!: ReportTrace;

  @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy!: string | null;

  @Column({ name: 'validated_by', type: 'uuid', nullable: true }) validatedBy!: string | null;

  @Column({ name: 'validated_at', type: 'timestamptz', nullable: true }) validatedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
