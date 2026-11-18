import { describe, expect, it, vi } from 'vitest';
import { AcademyBadge } from './academy-badge.entity.js';
import { AcademyUserBadge } from './academy-user-badge.entity.js';
import { AcademyBadgeService } from './academy-badge.service.js';

function badge(over: Partial<AcademyBadge> = {}): AcademyBadge {
  return Object.assign(new AcademyBadge(), {
    id: 'b1',
    code: 'RISK_2',
    kind: 'skill',
    title: 'Risque niveau 2',
    description: null,
    icon: null,
    position: 0,
    ...over,
  });
}

function userBadge(over: Partial<AcademyUserBadge> = {}): AcademyUserBadge {
  return Object.assign(new AcademyUserBadge(), {
    id: 'ub1',
    userId: 'u1',
    badgeId: 'b1',
    ruleId: 'r1',
    awardedAt: new Date('2026-03-01T10:00:00Z'),
    ...over,
  });
}

function setup(badgesRows: AcademyBadge[], ownedRows: AcademyUserBadge[]) {
  const badges = { find: vi.fn().mockResolvedValue(badgesRows) };
  const userBadges = { find: vi.fn().mockResolvedValue(ownedRows) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new AcademyBadgeService(badges as any, userBadges as any);
  return { service, badges, userBadges };
}

describe('AcademyBadgeService.listBadges', () => {
  it('renvoie le catalogue des badges', async () => {
    const { service } = setup([badge(), badge({ id: 'b2', code: 'START', kind: 'achievement' })], []);
    const list = await service.listBadges();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: 'b1', code: 'RISK_2', kind: 'skill' });
  });
});

describe('AcademyBadgeService.getMyBadges', () => {
  it('joint les badges obtenus avec leur métadonnées et leur date', async () => {
    const { service } = setup(
      [badge({ id: 'b1' }), badge({ id: 'b2', code: 'EXPERT', kind: 'level', title: 'Expert' })],
      [
        userBadge({ id: 'ub2', badgeId: 'b2', awardedAt: new Date('2026-03-02T10:00:00Z') }),
        userBadge({ id: 'ub1', badgeId: 'b1', awardedAt: new Date('2026-03-01T10:00:00Z') }),
      ],
    );
    const mine = await service.getMyBadges('u1');
    expect(mine).toHaveLength(2);
    expect(mine[0]).toMatchObject({ code: 'EXPERT', kind: 'level', ruleId: 'r1' });
    expect(mine[0].awardedAt).toEqual(new Date('2026-03-02T10:00:00Z'));
  });

  it('ignore un badge obtenu qui n’existe plus au catalogue', async () => {
    const { service } = setup([badge({ id: 'b1' })], [
      userBadge({ id: 'ub1', badgeId: 'b1' }),
      userBadge({ id: 'ub2', badgeId: 'ghost' }),
    ]);
    const mine = await service.getMyBadges('u1');
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe('b1');
  });

  it('renvoie une liste vide quand le joueur n’a aucun badge', async () => {
    const { service, badges } = setup([], []);
    expect(await service.getMyBadges('u1')).toEqual([]);
    expect(badges.find).not.toHaveBeenCalled();
  });
});
