import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { GameRoomService } from './services/game-room.service.js';

/**
 * Teste la création d'une salle sans base de données : les dépôts TypeORM sont
 * remplacés par des doubles qui enregistrent ce que le service persisterait.
 */
function buildService(overrides: { profile?: unknown; joinCodeTaken?: boolean; historicalSpan?: number | null } = {}) {
  const saved: any[] = [];
  const rooms: any = {
    findOne: async ({ where }: any) => {
      if (where?.joinCode && overrides.joinCodeTaken) return { id: 'existing', joinCode: where.joinCode };
      return null;
    },
    create: (input: any) => ({ ...input }),
    save: async (room: any) => {
      const stored = { id: 'room-1', createdAt: new Date('2026-11-01T10:00:00Z'), ...room };
      saved.push(stored);
      return stored;
    },
  };
  const profilesRepo: any = {
    findOne: async () =>
      overrides.profile === null
        ? null
        : (overrides.profile ?? { id: 'master-1', role: 'game_master', fullName: 'Prof. Test' }),
  };
  const marketSource: any = {
    measureHistoricalSpan: async () => overrides.historicalSpan ?? null,
    primarySymbol: (room: any) => room.assets?.[0] ?? 'XAU/USD',
    roomSymbols: (room: any) => room.assets ?? ['XAU/USD'],
  };
  const empty: any = {};

  const service = new GameRoomService(
    rooms,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    profilesRepo,
    empty,
    marketSource,
  );

  return { service, saved };
}

const CSV = [
  'timestamp,open,high,low,close,volume',
  '2026-01-05T09:00:00Z,100,105,99,104,10',
  '2026-01-05T09:01:00Z,104,106,103,105,12',
  '2026-01-05T09:02:00Z,105,107,104,106,8',
].join('\n');

describe('GameRoomService.createRoom', () => {
  it('crée la salle de scénario par défaut avec le capital et les actifs par défaut', async () => {
    const { service, saved } = buildService();

    const room = await service.createRoom('master-1', { name: 'Séance découverte' });

    expect(saved).toHaveLength(1);
    expect(room.name).toBe('Séance découverte');
    expect(room.masterId).toBe('master-1');
    expect(room.status).toBe('waiting');
    expect(room.scenarioId).toBe('panic_tuesday');
    expect(room.sourceMode).toBe('scenario');
    expect(room.assets).toEqual(['XAU/USD']);
    expect(room.initialCapital).toBe('100000.00');
    expect(room.currency).toBe('USD');
    expect(room.leverage).toBe('1');
    expect(room.commissionPercent).toBe('0');
    expect(room.allowShortSelling).toBe(false);
    expect(room.joinCode).toMatch(/^[A-Z2-9]{6}$/);
    // 30 min de scénario jouées en 30 min réelles ⇒ vitesse x1
    expect(room.totalSimSeconds).toBe(1800);
    expect(Number(room.playbackSpeed)).toBe(1);
    expect(room.durationMinutes).toBe(30);
    expect(room.timeframe).toBe('1m');
    expect(room.simElapsedSeconds).toBe(0);
  });

  it('applique la configuration personnalisée : actifs, capital, levier, frais et risque', async () => {
    const { service } = buildService();

    const room = await service.createRoom('master-1', {
      name: 'Séance krach',
      config: {
        description: 'Gestion du risque en marché stressé',
        assets: ['XAU/USD', 'BTC/USD'],
        maxParticipants: 12,
        initialCapital: 50000,
        currency: 'EUR',
        spreadMultiplier: 4,
        commissionPercent: 0.2,
        leverage: 10,
        allowShortSelling: true,
        maxExposure: 200000,
        riskLimitPercent: 2,
      },
      source: { mode: 'synthetic', symbol: 'BTC/USD', initialPrice: 67000, volatilityPercent: 6, trendPercent: -4, seed: 42 },
      time: { durationMinutes: 5, timeframe: '5m', playbackSpeed: 12 },
    });

    expect(room.description).toBe('Gestion du risque en marché stressé');
    expect(room.assets).toEqual(['XAU/USD', 'BTC/USD']);
    expect(room.maxParticipants).toBe(12);
    expect(room.initialCapital).toBe('50000.00');
    expect(room.currency).toBe('EUR');
    expect(room.spreadMultiplier).toBe('4');
    expect(room.commissionPercent).toBe('0.2');
    expect(room.leverage).toBe('10');
    expect(room.allowShortSelling).toBe(true);
    expect(room.maxExposure).toBe('200000.00');
    expect(room.riskLimitPercent).toBe('2.00');
    expect(room.sourceMode).toBe('synthetic');
    expect(room.sourceConfig).toMatchObject({ symbol: 'BTC/USD', initialPrice: 67000, volatilityPercent: 6, trendPercent: -4, seed: 42 });
    expect(room.timeframe).toBe('5m');
    // 5 min réelles à x12 ⇒ 3 600 s de marché synthétique
    expect(room.totalSimSeconds).toBe(3600);
    expect(Number(room.playbackSpeed)).toBe(12);
  });

  it('calcule la vitesse de relecture des données historiques (24 h en 30 min ⇒ x48)', async () => {
    const { service } = buildService({ historicalSpan: 86400 });

    const room = await service.createRoom('master-1', {
      name: 'Replay 24 h',
      config: { assets: ['EUR/USD'] },
      source: { mode: 'historical', symbol: 'EUR/USD', historyRange: '24h' },
      time: { durationMinutes: 30 },
    });

    expect(room.sourceMode).toBe('historical');
    expect(room.totalSimSeconds).toBe(86400);
    expect(Number(room.playbackSpeed)).toBe(48);
    expect(room.historyStartAt).toBeInstanceOf(Date);
    expect(room.historyEndAt).toBeInstanceOf(Date);
    expect((room.historyEndAt as Date).getTime() - (room.historyStartAt as Date).getTime()).toBe(86400_000);
  });

  it('reparse le CSV côté serveur et en déduit la durée et la vitesse', async () => {
    const { service } = buildService();

    const room = await service.createRoom('master-1', {
      name: 'Import CSV',
      source: { mode: 'csv', csvContent: CSV },
      time: { durationMinutes: 1 },
    });

    expect(room.sourceMode).toBe('csv');
    expect(room.sourceConfig.candles).toHaveLength(3);
    expect(room.sourceConfig.candles?.[0].close).toBe(104);
    // 2 min de bougies rejouées en 1 min réelle ⇒ x2
    expect(room.totalSimSeconds).toBe(120);
    expect(Number(room.playbackSpeed)).toBe(2);
  });

  it('refuse un CSV sans au moins deux bougies valides', async () => {
    const { service } = buildService();

    await expect(
      service.createRoom('master-1', {
        name: 'CSV vide',
        source: { mode: 'csv', csvContent: 'timestamp,open,high,low,close\n2026-01-05T09:00:00Z,100,105,99,104\n' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('impose la vitesse 1x en marché live', async () => {
    const { service } = buildService();

    const room = await service.createRoom('master-1', {
      name: 'Live BTC',
      config: { assets: ['BTC/USD'] },
      source: { mode: 'live', symbol: 'BTC/USD' },
      time: { durationMinutes: 10, playbackSpeed: 50 },
    });

    expect(room.sourceMode).toBe('live');
    expect(Number(room.playbackSpeed)).toBe(1);
    expect(room.totalSimSeconds).toBe(600);
    expect(room.historyStartAt).toBeNull();
  });

  it('refuse de créer une salle si le profil meneur de jeu est introuvable', async () => {
    const { service, saved } = buildService({ profile: null });

    await expect(service.createRoom('ghost', { name: 'Salle fantôme' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(saved).toHaveLength(0);
  });

  it('échoue si aucun code de participation libre ne peut être généré', async () => {
    const { service } = buildService({ joinCodeTaken: true });

    await expect(service.createRoom('master-1', { name: 'Collision de code' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
