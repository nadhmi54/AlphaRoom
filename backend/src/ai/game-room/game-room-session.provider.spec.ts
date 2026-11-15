import { describe, expect, it } from 'vitest';
import type { GameRoom } from '../../game-room/entities/game-room.entity.js';
import type { RunSnapshot } from '../../game-room/run-snapshot.js';
import type { RunSnapshotService } from '../../game-room/services/run-snapshot.service.js';
import { SessionNotFoundError } from '../contract/session-data-provider.js';
import { GameRoomSessionProvider } from './game-room-session.provider.js';

const room = { id: 'r1', name: 'Salle 1', durationMinutes: 30 } as unknown as GameRoom;

const snap = (run: number, trades = 1): RunSnapshot => ({
  roomId: 'r1',
  roomName: 'Salle 1',
  run,
  elapsedMinutes: 2,
  durationMinutes: 30,
  initialCapital: 100000,
  symbols: ['XAU/USD'],
  sourceMode: 'synthetic',
  scenarioId: 'x',
  participants: [{ userId: 'u1', nickname: 'Amine' }],
  trades: Array.from({ length: trades }, (_, i) => ({
    id: `t${run}-${i}`, userId: 'u1', symbol: 'XAU/USD', side: 'buy' as const, quantity: 1, price: 2700, minute: 1, orderId: null,
  })),
  orders: [],
  events: [],
  series: { 'XAU/USD': [{ t: 0, price: 2700 }, { t: 120, price: 2690 }] },
});

function build(archives: Record<number, RunSnapshot> = {}, currentRun = 1) {
  const service = {
    findRoom: async (id: string) => (id === 'r1' ? room : null),
    capture: async () => snap(currentRun),
    archivedSnapshot: async (_id: string, run: number) => archives[run] ?? null,
    recentRooms: async () => [room],
    participantIds: async () => new Map([['r1', ['u1', 'u2']]]),
    archivedRunsByRoom: async () => new Map([['r1', Object.keys(archives).map(Number).sort()]]),
    symbolsOf: () => ['XAU/USD'],
  } as unknown as RunSnapshotService;
  return new GameRoomSessionProvider(service);
}

describe('GameRoomSessionProvider', () => {
  it('renvoie le passage courant', async () => {
    const data = await build().getSession('r1', 1);
    expect(data).toMatchObject({ sessionId: 'r1', run: 1, title: 'Salle 1' });
    expect(data.participants[0]!.trades).toHaveLength(1);
  });

  it('renvoie le passage archivé avant le rollback, et le courant après', async () => {
    const provider = build({ 1: snap(1, 3) }, 2);
    expect((await provider.getSession('r1', 1)).participants[0]!.trades).toHaveLength(3);
    const current = await provider.getSession('r1', 2);
    expect(current.run).toBe(2);
    expect(current.participants[0]!.trades).toHaveLength(1);
  });

  it('séance ou passage inconnu : SessionNotFoundError', async () => {
    const provider = build();
    await expect(provider.getSession('autre', 1)).rejects.toBeInstanceOf(SessionNotFoundError);
    await expect(provider.getSession('r1', 3)).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('liste les salles avec leurs passages et participants', async () => {
    const list = await build({ 1: snap(1) }, 2).listSessions();
    expect(list).toEqual([
      { sessionId: 'r1', title: 'Salle 1', runs: [1, 2], durationMinutes: 30, symbols: ['XAU/USD'], participantIds: ['u1', 'u2'] },
    ]);
  });
});
