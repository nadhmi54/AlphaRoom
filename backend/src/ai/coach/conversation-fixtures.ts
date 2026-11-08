import { AiConversationsService } from './ai-conversations.service.js';

type Row = { id?: string | number; createdAt?: Date; updatedAt?: Date; [key: string]: unknown };

/** Dépôt en mémoire minimal (find / findOne / create / save / delete) pour tester sans base de données. */
export class FakeRepo<T extends Row> {
  rows: T[] = [];
  private counter = 0;
  private clock = 0;
  constructor(private readonly idKind: 'uuid' | 'increment') {}

  create(data: Partial<T>): T {
    return { ...data } as T;
  }

  async save(input: T | T[]): Promise<T | T[]> {
    const list = Array.isArray(input) ? input : [input];
    for (const row of list) {
      if (!row.id) {
        this.counter += 1;
        row.id = this.idKind === 'uuid' ? `00000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}` : String(this.counter);
        row.createdAt = new Date(2026, 10, 8, 10, 0, this.counter);
        this.rows.push(row);
      }
      this.clock += 1;
      if (this.idKind === 'uuid' && !row.updatedAt) row.updatedAt = new Date(2026, 10, 8, 10, 0, this.counter);
    }
    return Array.isArray(input) ? list : list[0]!;
  }

  private match(row: T, where: Record<string, unknown> = {}) {
    return Object.entries(where).every(([k, v]) => row[k] === v);
  }

  async findOne(options: { where: Record<string, unknown> }): Promise<T | null> {
    return this.rows.find((r) => this.match(r, options.where)) ?? null;
  }

  async find(options: { where?: Record<string, unknown>; order?: Record<string, 'ASC' | 'DESC'>; skip?: number; take?: number } = {}): Promise<T[]> {
    let out = this.rows.filter((r) => this.match(r, options.where));
    const [key, dir] = Object.entries(options.order ?? {})[0] ?? [];
    if (key) {
      out = [...out].sort((a, b) => {
        const av = key === 'id' ? Number(a[key]) : (a[key] as Date).getTime();
        const bv = key === 'id' ? Number(b[key]) : (b[key] as Date).getTime();
        return dir === 'DESC' ? bv - av : av - bv;
      });
    }
    return out.slice(options.skip ?? 0, options.take !== undefined ? (options.skip ?? 0) + options.take : undefined);
  }

  async delete(where: Record<string, unknown>): Promise<void> {
    this.rows = this.rows.filter((r) => !this.match(r, where));
  }
}

export function buildConversationStore() {
  const conversations = new FakeRepo<Row>('uuid');
  const messages = new FakeRepo<Row>('increment');
  // La suppression d'une discussion supprime ses messages (clé étrangère « on delete cascade »).
  const originalDelete = conversations.delete.bind(conversations);
  conversations.delete = async (where) => {
    const doomed = conversations.rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v)).map((r) => r.id);
    await originalDelete(where);
    messages.rows = messages.rows.filter((m) => !doomed.includes(m.conversationId as string));
  };
  const service = new AiConversationsService(conversations as never, messages as never);
  return { service, conversations, messages };
}
