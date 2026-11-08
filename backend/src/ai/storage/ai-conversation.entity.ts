import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Une discussion avec le coach. Appartient à une seule personne ; ses messages sont
 * relus par le serveur à chaque question. `summary` condense les plus anciens messages
 * (les `summarizedCount` premiers) quand la discussion devient longue.
 */
@Entity({ name: 'ai_conversations' })
export class AiConversation {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;

  @Column({ type: 'varchar', length: 120 }) title!: string;

  @Column({ name: 'session_id', type: 'text', nullable: true }) sessionId!: string | null;

  @Column({ type: 'text', nullable: true }) summary!: string | null;

  @Column({ name: 'summarized_count', type: 'integer', default: 0 }) summarizedCount!: number;

  @Column({ name: 'message_count', type: 'integer', default: 0 }) messageCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
