import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export interface ConversationMessageMeta {
  source?: 'llm' | 'rules';
  toolsUsed?: string[];
  unverified?: string[];
  sessionId?: string;
  run?: number;
  evidence?: unknown[];
}

@Entity({ name: 'ai_conversation_messages' })
export class AiConversationMessage {
  /** Identifiant croissant : l'ordre des messages dans la discussion. */
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id!: string;

  @Column({ name: 'conversation_id', type: 'uuid' }) conversationId!: string;

  @Column({ type: 'varchar', length: 10 }) role!: 'user' | 'assistant';

  @Column({ type: 'text' }) content!: string;

  @Column({ type: 'jsonb', nullable: true }) meta!: ConversationMessageMeta | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
