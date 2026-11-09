import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { In, type Repository } from 'typeorm';
import { AcademyBadge } from './academy-badge.entity.js';
import { AcademyUserBadge } from './academy-user-badge.entity.js';
import { BadgeDto, UserBadgeDto } from './dto/badge.dto.js';

/**
 * Lecture des badges (niveau, compétence, réussite). L'attribution est faite
 * exclusivement par le moteur de règles (`AcademyRulesService`), qui écrit dans
 * `academy_user_badges` ; ce service ne fait que relire le catalogue et les
 * badges obtenus par un joueur. Il n'accorde jamais rien lui-même.
 */
@Injectable()
export class AcademyBadgeService {
  constructor(
    @InjectRepository(AcademyBadge)
    private readonly badges: Repository<AcademyBadge>,
    @InjectRepository(AcademyUserBadge)
    private readonly userBadges: Repository<AcademyUserBadge>,
  ) {}

  /** Catalogue complet des badges, triés par nature puis position. */
  async listBadges(): Promise<BadgeDto[]> {
    const badges = await this.badges.find({
      order: { kind: 'ASC', position: 'ASC', title: 'ASC' },
    });
    return badges.map((badge) => plainToInstance(BadgeDto, badge));
  }

  /**
   * Badges obtenus par un joueur, du plus récent au plus ancien. Un badge
   * supprimé du catalogue est simplement ignoré (la jointure est faite à la
   * main pour rester indépendante des relations TypeORM).
   */
  async getMyBadges(userId: string): Promise<UserBadgeDto[]> {
    const owned = await this.userBadges.find({
      where: { userId },
      order: { awardedAt: 'DESC' },
    });
    if (owned.length === 0) return [];

    const badges = await this.badges.find({ where: { id: In(owned.map((row) => row.badgeId)) } });
    const byId = new Map(badges.map((badge) => [badge.id, badge]));

    const result: UserBadgeDto[] = [];
    for (const row of owned) {
      const badge = byId.get(row.badgeId);
      if (!badge) continue;
      result.push(
        plainToInstance(UserBadgeDto, {
          ...badge,
          awardedAt: row.awardedAt,
          ruleId: row.ruleId,
        }),
      );
    }
    return result;
  }
}
