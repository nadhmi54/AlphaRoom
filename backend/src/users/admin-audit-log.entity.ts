import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

export type AuditAction = 'role_changed' | 'account_disabled' | 'account_enabled';

/** Journal des actions d'administration sur les comptes (qui a fait quoi, sur qui). */
@Entity({ name: 'admin_audit_logs' })
export class AdminAuditLog {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  @Index()
  @Column({ name: 'target_id', type: 'uuid' })
  targetId!: string;

  @Column({ type: 'varchar', length: 40 })
  action!: AuditAction;

  @Column({ type: 'jsonb', nullable: true })
  details!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
