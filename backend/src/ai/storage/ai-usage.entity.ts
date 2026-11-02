import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type UsagePurpose = 'evaluation' | 'coach' | 'market_analysis' | 'replay';

/** Une ligne par appel au modèle : sert à surveiller le budget (tokens). */
@Entity({ name: 'ai_usage' })
export class AiUsage {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id!: string;

  @Column({ name: 'report_id', type: 'uuid', nullable: true }) reportId!: string | null;

  @Column({ name: 'session_id', type: 'text', nullable: true }) sessionId!: string | null;

  @Column({ type: 'integer', nullable: true }) run!: number | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId!: string | null;

  @Column({ type: 'varchar', length: 20 }) purpose!: UsagePurpose;

  @Column({ type: 'varchar', length: 20 }) provider!: string;

  @Column({ type: 'varchar', length: 80 }) model!: string;

  @Column({ name: 'input_tokens', type: 'integer', default: 0 }) inputTokens!: number;

  @Column({ name: 'output_tokens', type: 'integer', default: 0 }) outputTokens!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
