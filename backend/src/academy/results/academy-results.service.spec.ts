import { describe, expect, it, vi } from 'vitest';
import { PerformanceMetricsService } from '../../portefeuille/performance/performance-metrics.service.js';
import { UserRole } from '../../users/user-role.enum.js';
import type { GameRoom } from '../../game-room/entities/game-room.entity.js';
import { AcademyResultsService } from './academy-results.service.js';

function room(over: Partial<GameRoom> = {}): GameRoom {
  return Object.assign({} as GameRoom, {
    id: 'room-1',
    masterId: 'master-1',
    scenarioId: 'panic_tuesday',
    initialCapital: '100000',
    assets: ['X'],
    status: 'finished',
    ...over,
  });
}

interface SetupOptions {
  participants?: unknown[];
  trades?: unknown[];
  profiles?: unknown[];
  existing?: unknown[];
}

function setup(options: SetupOptions = {}) {
  const resultsRepo = {
    find: vi.fn().mockResolvedValue(options.existing ?? []),
    create: vi.fn((value: unknown) => value),
    save: vi.fn(async (value: Record<string, unknown>) => ({ ...value, id: 'result-1' })),
  };
  const gameRoom = {
    rooms: { find: vi.fn().mockResolvedValue([room()]) },
    participants: { find: vi.fn().mockResolvedValue(options.participants ?? []) },
    trades: { find: vi.fn().mockResolvedValue(options.trades ?? []) },
    profilesRepo: { find: vi.fn().mockResolvedValue(options.profiles ?? []) },
  };
  const marketSource = {
    calculateCurrentElapsedSeconds: vi.fn().mockReturnValue(600),
    roomSymbols: vi.fn().mockReturnValue(['X']),
    buildSeries: vi
      .fn()
      .mockResolvedValue([{ t: 0, price: 10 }, { t: 600, price: 12 }]),
  };
  const rules = { processEvent: vi.fn().mockResolvedValue([]) };

  const service = new AcademyResultsService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resultsRepo as any,
    gameRoom as any,
    marketSource as any,
    new PerformanceMetricsService(),
    rules as any,
  );
  return { service, resultsRepo, gameRoom, marketSource, rules };
}

describe('AcademyResultsService.ingestFinishedRooms', () => {
  it('transforme un participant en résultat et émet « partie terminée »', async () => {
    const { service, rules, resultsRepo } = setup({
      participants: [{ userId: 'u1', roomId: 'room-1' }],
      trades: [{ userId: 'u1', symbol: 'X', side: 'buy', quantity: 10, price: 10, simMinute: 1 }],
      profiles: [{ id: 'u1', role: UserRole.TRADER }],
    });

    const ingested = await service.ingestFinishedRooms();

    expect(ingested).toBe(1);
    expect(resultsRepo.save).toHaveBeenCalledTimes(1);
    expect(rules.processEvent).toHaveBeenCalledTimes(1);
    expect(rules.processEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'game_finished',
        userId: 'u1',
        roomId: 'room-1',
        scenarioId: 'panic_tuesday',
        metrics: expect.objectContaining({ ordersCount: 1, durationSeconds: 600 }),
      }),
    );
  });

  it('ignore les participants déjà ingérés (anti-jointure)', async () => {
    const { service, resultsRepo, rules } = setup({
      participants: [{ userId: 'u1', roomId: 'room-1' }],
      profiles: [{ id: 'u1', role: UserRole.TRADER }],
      existing: [{ userId: 'u1' }],
    });

    expect(await service.ingestFinishedRooms()).toBe(0);
    expect(resultsRepo.save).not.toHaveBeenCalled();
    expect(rules.processEvent).not.toHaveBeenCalled();
  });

  it('écarte le meneur de jeu et les comptes non étudiants', async () => {
    const { service } = setup({
      participants: [
        { userId: 'u1', roomId: 'room-1' },
        { userId: 'master-1', roomId: 'room-1' },
        { userId: 'gm-1', roomId: 'room-1' },
      ],
      profiles: [
        { id: 'u1', role: UserRole.TRADER },
        { id: 'gm-1', role: UserRole.GAME_MASTER },
      ],
    });

    expect(await service.ingestFinishedRooms()).toBe(1);
  });

  it('ne fait rien quand la salle n’a aucun participant à traiter', async () => {
    const { service, gameRoom } = setup({ participants: [] });
    expect(await service.ingestFinishedRooms()).toBe(0);
    expect(gameRoom.profilesRepo.find).not.toHaveBeenCalled();
  });
});
