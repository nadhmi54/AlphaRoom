import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Profile } from '../../users/profile.entity.js';
import { InMemorySessionDataProvider } from '../contract/session-data-provider.js';
import type { SessionData } from '../contract/session-data.js';
import { AiGameRoomService } from './ai-game-room.service.js';

const session = (run: number): SessionData => ({
  sessionId: 'room-1',
  title: 'Salle 1',
  run,
  initialCash: 100000,
  durationMinutes: 30,
  symbols: ['XAU/USD'],
  prices: [{ minute: 0, symbol: 'XAU/USD', price: 2700 }],
  events: [],
  participants: [{ id: 'u1', displayName: 'Amine', trades: [], protections: [], equity: [] }],
});

const student = { id: 'u1', role: 'trader' } as Profile;
const outsider = { id: 'u9', role: 'trader' } as Profile;

function build() {
  const coach = { ask: vi.fn().mockResolvedValue({ answer: 'ok', source: 'llm' }) };
  const analysis = { marketForParticipant: vi.fn().mockResolvedValue({ analysis: { highlights: [] }, commentary: null }) };
  const reports = { list: vi.fn(async (_p: Profile, q: { run: number }) => (q.run === 1 ? [{ id: 'r1', run: 1 }] : [])) };
  const sessions = new InMemorySessionDataProvider([session(1), session(2)]);
  const service = new AiGameRoomService(sessions, coach as never, analysis as never, reports as never);
  return { service, coach, analysis, reports };
}

describe('AiGameRoomService', () => {
  it('l’analyste utilise le dernier passage de la salle', async () => {
    const { service, analysis } = build();
    const out = await service.analyst(student, 'room-1');
    expect(analysis.marketForParticipant).toHaveBeenCalledWith(student, { sessionId: 'room-1', run: 2 });
    expect(out).toMatchObject({ role: 'AI Market Analyst', run: 2 });
  });

  it('le coach reçoit la salle, le dernier passage et la question', async () => {
    const { service, coach } = build();
    const out = await service.askCoach(student, 'room-1', 'Pourquoi ?');
    expect(coach.ask).toHaveBeenCalledWith(student, { question: 'Pourquoi ?', sessionId: 'room-1', run: 2, history: undefined });
    expect(out).toMatchObject({ role: 'AI Trading Coach', answer: 'ok' });
  });

  it('le bilan réunit les passages publiés, sinon explique qu’il n’est pas encore publié', async () => {
    const { service, reports } = build();
    const out = await service.evaluation(student, 'room-1');
    expect(reports.list).toHaveBeenCalledTimes(2);
    expect(out.reports).toEqual([{ id: 'r1', run: 1 }]);
    expect(out.message).toBeUndefined();

    reports.list.mockResolvedValue([]);
    expect((await service.evaluation(student, 'room-1')).message).toContain('pas encore publié');
  });

  it('refuse un utilisateur qui ne participe pas à la salle', async () => {
    const { service } = build();
    await expect(service.analyst(outsider, 'room-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.askCoach(outsider, 'room-1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.evaluation(outsider, 'room-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
