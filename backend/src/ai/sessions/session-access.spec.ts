import { describe, expect, it } from 'vitest';
import type { Profile } from '../../users/profile.entity.js';
import { UserRole } from '../../users/user-role.enum.js';
import { InMemorySessionDataProvider, UnconfiguredSessionDataProvider } from '../contract/session-data-provider.js';
import { createDemoProvider, remapParticipant, DEMO_STUDENT_FIXTURE_ID } from '../demo/demo-provider.js';
import { buildPanicTuesday } from '../fixtures/panic-tuesday.js';
import { listVisibleSessions } from './session-access.js';

const p = (id: string, role: UserRole) => ({ id, role }) as Profile;

describe('séances visibles', () => {
  const demo = createDemoProvider();

  it('l’enseignant voit toutes les séances, avec les deux passages', async () => {
    const list = await listVisibleSessions(demo, p('prof', UserRole.GAME_MASTER));
    expect(list).toEqual([
      expect.objectContaining({ sessionId: 'mardi-panique', runs: [1, 2], latestRun: 2, participantCount: 4, joined: false }),
    ]);
    expect(JSON.stringify(list)).not.toContain('user-amine');
  });

  it('l’étudiant ne voit que ses séances', async () => {
    expect(await listVisibleSessions(demo, p('user-amine', UserRole.TRADER))).toHaveLength(1);
    expect(await listVisibleSessions(demo, p('autre', UserRole.TRADER))).toEqual([]);
  });

  it('fournisseur sans listSessions : liste vide', async () => {
    const minimal = { getSession: (...a: Parameters<InMemorySessionDataProvider['getSession']>) => new InMemorySessionDataProvider([buildPanicTuesday()]).getSession(...a) };
    expect(await listVisibleSessions(minimal, p('prof', UserRole.ADMIN))).toEqual([]);
  });

  it('source non branchée : 503', async () => {
    await expect(listVisibleSessions(new UnconfiguredSessionDataProvider(), p('prof', UserRole.ADMIN))).rejects.toThrow('pas encore branchée');
  });
});

describe('fournisseur de démonstration', () => {
  it('rattache un vrai compte à l’étudiant fictif Amine', async () => {
    const provider = createDemoProvider('11111111-1111-4111-8111-111111111111');
    const run1 = await provider.getSession('mardi-panique', 1);
    const run2 = await provider.getSession('mardi-panique', 2);
    for (const run of [run1, run2]) {
      expect(run.participants.some((x) => x.id === DEMO_STUDENT_FIXTURE_ID)).toBe(false);
      expect(run.participants.find((x) => x.id === '11111111-1111-4111-8111-111111111111')?.displayName).toBe('Amine B.');
    }
  });

  it('remapParticipant ne touche pas aux autres participants', () => {
    const out = remapParticipant(buildPanicTuesday(), 'user-amine', 'x');
    expect(out.participants.map((q) => q.id).sort()).toEqual(['user-karim', 'user-lina', 'user-sarra', 'x']);
  });

  it('le passage 2 est bien différent du passage 1 pour Amine seulement', async () => {
    const a = (await demo().getSession('mardi-panique', 1)).participants;
    const b = (await demo().getSession('mardi-panique', 2)).participants;
    expect(JSON.stringify(a[0])).not.toBe(JSON.stringify(b[0]));
    expect(JSON.stringify(a.slice(1))).toBe(JSON.stringify(b.slice(1)));
  });
});

const demo = () => createDemoProvider();
