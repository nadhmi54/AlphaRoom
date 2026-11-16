import { Inject, Injectable } from '@nestjs/common';
import { RunSnapshotService } from '../../game-room/services/run-snapshot.service.js';
import {
  SessionNotFoundError,
  type SessionDataProvider,
  type SessionSummary,
} from '../contract/session-data-provider.js';
import type { SessionData } from '../contract/session-data.js';
import { buildSessionData } from './session-builder.js';

/**
 * Branche le module IA sur la vraie Game Room (AI_SESSION_SOURCE=game-room).
 *
 * Identifiant de séance = identifiant de la salle. Les passages archivés avant
 * un rollback gardent leur numéro ; le dernier passage est l'état courant.
 * Lecture seule : rien n'est écrit dans la simulation.
 */
@Injectable()
export class GameRoomSessionProvider implements SessionDataProvider {
  constructor(@Inject(RunSnapshotService) private readonly snapshots: RunSnapshotService) {}

  async getSession(sessionId: string, run: number): Promise<SessionData> {
    const room = await this.snapshots.findRoom(sessionId);
    if (!room) throw new SessionNotFoundError(sessionId, run);

    const archived = await this.snapshots.archivedSnapshot(room.id, run);
    if (archived) return buildSessionData(archived);

    const current = await this.snapshots.capture(room);
    if (current.run !== run) throw new SessionNotFoundError(sessionId, run);
    return buildSessionData(current);
  }

  async listSessions(): Promise<SessionSummary[]> {
    const rooms = await this.snapshots.recentRooms();
    const ids = rooms.map((r) => r.id);
    const [participants, archivedByRoom] = await Promise.all([
      this.snapshots.participantIds(ids),
      this.snapshots.archivedRunsByRoom(ids),
    ]);
    const summaries: SessionSummary[] = [];
    for (const room of rooms) {
      const archived = archivedByRoom.get(room.id) ?? [];
      summaries.push({
        sessionId: room.id,
        title: room.name,
        runs: [...archived, (archived.at(-1) ?? 0) + 1],
        durationMinutes: Number(room.durationMinutes) || 30,
        symbols: this.snapshots.symbolsOf(room),
        participantIds: participants.get(room.id) ?? [],
      });
    }
    return summaries;
  }
}
