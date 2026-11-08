import { ValidationPipe, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard.js';
import { ProfileGuard, type AuthenticatedRequest } from '../users/profile.guard.js';
import type { Profile } from '../users/profile.entity.js';
import { GameRoomController } from './game-room.controller.js';
import { GameRoomAiService } from './services/game-room-ai.service.js';
import { RunSnapshotService } from './services/run-snapshot.service.js';
import { GameRoomService } from './services/game-room.service.js';
import { SimulationEngineService } from './services/simulation-engine.service.js';

/**
 * Contrat HTTP du module Game Master : routage, garde-fous de rôle, validation
 * des DTO (whitelist + transformation imbriquée) et paramètres transmis au
 * service. Le service est un double — sa logique métier est couverte par
 * `game-room-create-room.spec.ts`.
 */

const MASTER = { id: 'master-1', role: 'game_master', fullName: 'Prof. Test', isActive: true } as Profile;
const STUDENT = { id: 'student-1', role: 'trader', fullName: 'Étudiant', isActive: true } as Profile;

let currentProfile: Profile = MASTER;
let calls: Array<{ method: string; args: unknown[] }>;

function record(method: string) {
  return (...args: unknown[]) => {
    calls.push({ method, args });
  };
}

function buildServiceStub() {
  const room = {
    id: 'room-1',
    name: 'Séance krach',
    joinCode: 'KRACH1',
    status: 'waiting',
    playbackSpeed: '12',
    assets: ['XAU/USD', 'BTC/USD'],
  };
  return {
    rooms: { findOne: async () => room },
    createRoom: async (...args: unknown[]) => (record('createRoom')(...args), room),
    publicRoomView: (input: unknown) => (record('publicRoomView')(input), room),
    getMasterRooms: async (...args: unknown[]) => (record('getMasterRooms')(...args), [room]),
    updateRoomConfig: async (...args: unknown[]) => (record('updateRoomConfig')(...args), room),
    previewCsv: (...args: unknown[]) => (record('previewCsv')(...args), { preview: { rows: 3 }, issues: [] }),
    controlRoom: async (...args: unknown[]) => (record('controlRoom')(...args), { status: 'running' }),
    setSpeed: async (...args: unknown[]) => (record('setSpeed')(...args), { playbackSpeed: 12 }),
    seek: async (...args: unknown[]) => (record('seek')(...args), { simElapsedSeconds: 600 }),
    getRoomDetails: async (...args: unknown[]) => (record('getRoomDetails')(...args), { room }),
    getRoomCandles: async (...args: unknown[]) => (record('getRoomCandles')(...args), { candles: [] }),
    getStudentPortfolio: async (...args: unknown[]) => (record('getStudentPortfolio')(...args), { cash: '0' }),
    getMasterDashboard: async (...args: unknown[]) => (record('getMasterDashboard')(...args), { rows: [] }),
    getOrCreateDemoRoom: async (...args: unknown[]) => (record('getOrCreateDemoRoom')(...args), room),
    joinRoom: async (...args: unknown[]) => (record('joinRoom')(...args), { joined: true }),
  };
}

let app: INestApplication;
let baseUrl: string;

async function send(method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

const lastCall = (method: string) => calls.filter((call) => call.method === method).at(-1);

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [GameRoomController],
    providers: [
      { provide: GameRoomService, useValue: buildServiceStub() },
      {
        provide: SimulationEngineService,
        useValue: {
          placeSimulationOrder: async (...args: unknown[]) => (record('placeSimulationOrder')(...args), { filled: true }),
          closePosition: async (...args: unknown[]) => (record('closePosition')(...args), { closed: true }),
          applyGameMasterAction: async (...args: unknown[]) => (record('applyGameMasterAction')(...args), { applied: true }),
        },
      },
      { provide: GameRoomAiService, useValue: {} },
      { provide: RunSnapshotService, useValue: { archiveCurrentRun: async () => null } },
    ],
  })
    .overrideGuard(SupabaseJwtGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(ProfileGuard)
    .useValue({
      canActivate: (context: ExecutionContext) => {
        context.switchToHttp().getRequest<AuthenticatedRequest>().profile = currentProfile;
        return true;
      },
    })
    .compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  await app.listen(0);
  baseUrl = (await app.getUrl()).replace(/\/$/, '');
});

afterAll(async () => {
  await app?.close();
});

beforeEach(() => {
  calls = [];
  currentProfile = MASTER;
});

describe('POST /api/game-room/create', () => {
  const payload = {
    name: 'Séance krach',
    config: {
      assets: ['XAU/USD', 'BTC/USD'],
      initialCapital: 50000,
      currency: 'EUR',
      leverage: 10,
      commissionPercent: 0.2,
      allowShortSelling: true,
      riskLimitPercent: 2,
    },
    source: { mode: 'synthetic', symbol: 'BTC/USD', initialPrice: 67000, volatilityPercent: 6 },
    time: { durationMinutes: 5, timeframe: '5m', playbackSpeed: 12 },
  };

  it('accepte une configuration complète et transmet les objets imbriqués typés', async () => {
    const { status, json } = await send('POST', '/api/game-room/create', payload);

    expect(status).toBe(201);
    expect(json.joinCode).toBe('KRACH1');
    const [masterId, body] = lastCall('createRoom')!.args as [string, any];
    expect(masterId).toBe('master-1');
    expect(body.name).toBe('Séance krach');
    expect(body.config.leverage).toBe(10);
    expect(body.config.assets).toEqual(['XAU/USD', 'BTC/USD']);
    expect(body.source.mode).toBe('synthetic');
    expect(body.time.durationMinutes).toBe(5);
  });

  it('supprime les champs non déclarés du DTO (whitelist), y compris imbriqués', async () => {
    const { status } = await send('POST', '/api/game-room/create', {
      name: 'Salle propre',
      isMaster: true,
      config: { leverage: 5, pirate: 'x' },
    });

    expect(status).toBe(201);
    const [, body] = lastCall('createRoom')!.args as [string, any];
    expect(body.isMaster).toBeUndefined();
    expect(body.config.pirate).toBeUndefined();
    expect(body.config.leverage).toBe(5);
  });

  it('rejette un nom manquant, un mode de source inconnu et une durée nulle', async () => {
    expect((await send('POST', '/api/game-room/create', { config: {} })).status).toBe(400);
    expect((await send('POST', '/api/game-room/create', { name: 'X', source: { mode: 'oracle' } })).status).toBe(400);
    expect((await send('POST', '/api/game-room/create', { name: 'X', time: { durationMinutes: 0 } })).status).toBe(400);
    expect(lastCall('createRoom')).toBeUndefined();
  });

  it('refuse un actif hors catalogue et un timeframe invalide', async () => {
    expect((await send('POST', '/api/game-room/create', { name: 'X', config: { assets: ['DOGE/USD'] } })).status).toBe(400);
    expect((await send('POST', '/api/game-room/create', { name: 'X', time: { timeframe: '2m' } })).status).toBe(400);
  });

  it('accepte une graine au format date (AAAAMMJJ), valeur par défaut du formulaire', async () => {
    const { status } = await send('POST', '/api/game-room/create', {
      name: 'Graine date',
      source: { mode: 'synthetic', seed: 20261101 },
    });

    expect(status).toBe(201);
    const [, body] = lastCall('createRoom')!.args as [string, any];
    expect(body.source.seed).toBe(20261101);
  });

  it('interdit la création à un étudiant', async () => {
    currentProfile = STUDENT;
    const { status } = await send('POST', '/api/game-room/create', payload);

    expect(status).toBe(403);
    expect(lastCall('createRoom')).toBeUndefined();
  });
});

describe('POST /api/game-room/preview-csv', () => {
  it('transmet le contenu brut du fichier au parseur serveur', async () => {
    const content = 'timestamp,open,high,low,close\n2026-01-05T09:00:00Z,100,105,99,104';
    const { status, json } = await send('POST', '/api/game-room/preview-csv', { content, filename: 'or.csv' });

    expect(status).toBe(201);
    expect(json.preview.rows).toBe(3);
    expect(lastCall('previewCsv')!.args).toEqual([content]);
  });

  it('rejette un contenu vide', async () => {
    expect((await send('POST', '/api/game-room/preview-csv', { content: '' })).status).toBe(400);
  });
});

describe('Contrôles de séance du Meneur de Jeu', () => {
  it('applique une vitesse de relecture et refuse une valeur hors bornes', async () => {
    expect((await send('POST', '/api/game-room/room-1/speed', { speed: 12 })).status).toBe(201);
    expect(lastCall('setSpeed')!.args).toEqual(['room-1', 'master-1', 12]);
    expect((await send('POST', '/api/game-room/room-1/speed', { speed: 0 })).status).toBe(400);
    expect((await send('POST', '/api/game-room/room-1/speed', { speed: 'rapide' })).status).toBe(400);
  });

  it('déplace le curseur de séance en secondes entières', async () => {
    expect((await send('POST', '/api/game-room/room-1/seek', { seconds: 600 })).status).toBe(201);
    expect(lastCall('seek')!.args).toEqual(['room-1', 'master-1', 600]);
    expect((await send('POST', '/api/game-room/room-1/seek', { seconds: 1.5 })).status).toBe(400);
  });

  it('accepte les cinq actions de contrôle et refuse une action inconnue', async () => {
    for (const action of ['start', 'pause', 'resume', 'reset', 'finish']) {
      expect((await send('POST', '/api/game-room/room-1/control', { action })).status).toBe(201);
    }
    expect(lastCall('controlRoom')!.args).toEqual(['room-1', 'master-1', 'finish']);
    expect((await send('POST', '/api/game-room/room-1/control', { action: 'rewind' })).status).toBe(400);
  });

  it('interdit le pilotage de la séance à un étudiant', async () => {
    currentProfile = STUDENT;
    expect((await send('POST', '/api/game-room/room-1/speed', { speed: 2 })).status).toBe(403);
    expect((await send('POST', '/api/game-room/room-1/control', { action: 'start' })).status).toBe(403);
    expect((await send('GET', '/api/game-room/mine')).status).toBe(403);
    expect((await send('GET', '/api/game-room/room-1/dashboard')).status).toBe(403);
  });
});

describe('PATCH /api/game-room/:roomId/config', () => {
  it('transmet la nouvelle configuration et le CSV brut', async () => {
    const csvContent = 'timestamp,open,high,low,close\n2026-01-05T09:00:00Z,100,105,99,104';
    const { status } = await send('PATCH', '/api/game-room/room-1/config', {
      name: 'Salle rebaptisée',
      config: { initialCapital: 25000, maxExposure: 100000 },
      source: { mode: 'csv', csvContent },
    });

    expect(status).toBe(200);
    const [roomId, masterId, body] = lastCall('updateRoomConfig')!.args as [string, string, any];
    expect(roomId).toBe('room-1');
    expect(masterId).toBe('master-1');
    expect(body.name).toBe('Salle rebaptisée');
    expect(body.config.initialCapital).toBe(25000);
    expect(body.source.csvContent).toBe(csvContent);
  });
});

describe('Lecture de la salle par les participants', () => {
  it('liste les salles du meneur de jeu', async () => {
    const { status, json } = await send('GET', '/api/game-room/mine');

    expect(status).toBe(200);
    expect(json.rooms).toHaveLength(1);
    expect(lastCall('getMasterRooms')!.args).toEqual(['master-1']);
  });

  it('transmet le symbole actif et le timeframe demandés', async () => {
    await send('GET', '/api/game-room/room-1?symbol=BTC/USD');
    expect(lastCall('getRoomDetails')!.args).toEqual(['room-1', 'master-1', 'game_master', 'BTC/USD']);

    await send('GET', '/api/game-room/room-1/candles?symbol=EUR/USD&timeframe=15m');
    expect(lastCall('getRoomCandles')!.args).toEqual(['room-1', 'EUR/USD', '15m']);
  });

  it('laisse un étudiant consulter la salle et son portefeuille', async () => {
    currentProfile = STUDENT;

    expect((await send('GET', '/api/game-room/room-1')).status).toBe(200);
    expect((await send('GET', '/api/game-room/room-1/portfolio')).status).toBe(200);
    expect(lastCall('getStudentPortfolio')!.args).toEqual(['room-1', 'student-1']);
  });

  it('valide un ordre de simulation avant de le transmettre au moteur', async () => {
    currentProfile = STUDENT;
    const { status } = await send('POST', '/api/game-room/room-1/order', {
      symbol: 'XAU/USD',
      side: 'buy',
      type: 'limit',
      quantity: 0.5,
      limitPrice: 2680,
      stopLoss: 2650,
    });

    expect(status).toBe(201);
    const [order] = lastCall('placeSimulationOrder')!.args as [any];
    expect(order.userId).toBe('student-1');
    expect(order.symbol).toBe('XAU/USD');
    expect(order.limitPrice).toBe(2680);

    expect((await send('POST', '/api/game-room/room-1/order', { symbol: 'XAU/USD', side: 'hold', type: 'market', quantity: 1 })).status).toBe(400);
    expect((await send('POST', '/api/game-room/room-1/order', { symbol: 'XAU/USD', side: 'buy', type: 'market', quantity: 0 })).status).toBe(400);
  });
});
