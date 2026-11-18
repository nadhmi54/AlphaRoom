import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, type Repository } from 'typeorm';
import { AcademyCourse } from '../content/academy-course.entity.js';
import { AcademyBadge } from '../badges/academy-badge.entity.js';
import { AcademyUserBadge } from '../badges/academy-user-badge.entity.js';
import { AcademyUserUnlock } from '../progress/academy-user-unlock.entity.js';
import { AcademyProgressService } from '../progress/academy-progress.service.js';
import { AcademyUnlockRule } from './academy-unlock-rule.entity.js';
import { AcademyRuleApplication } from './academy-rule-application.entity.js';
import { evaluateRuleConditions, readRuleConditions } from './rule-conditions.js';
import type { AcademyEvent, AcademyReward } from './academy-events.js';

/** XP accordé par défaut, notamment quand une récompense déjà possédée est convertie. */
export const DEFAULT_REWARD_XP = 25;

/** Erreur Postgres de violation de contrainte d'unicité (idempotence). */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === UNIQUE_VIOLATION) return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.includes('duplicate key');
}

type CourseLike = Pick<AcademyCourse, 'id' | 'code' | 'level' | 'position' | 'isPremium'>;

/**
 * « Cours suivant » offert quand la récompense « cours » est déjà possédée :
 * premier cours avancé non débloqué strictement après le cours courant (niveau
 * puis position). Fonction pure, isolée pour être testable sans base.
 */
export function selectNextCourse(
  courses: CourseLike[],
  current: Pick<AcademyCourse, 'id' | 'level' | 'position'>,
  unlockedCourseIds: ReadonlySet<string>,
): CourseLike | null {
  const after = courses
    .filter(
      (course) =>
        course.isPremium &&
        !unlockedCourseIds.has(course.id) &&
        (course.level > current.level ||
          (course.level === current.level && course.position > current.position)),
    )
    .sort(
      (a, b) => a.level - b.level || a.position - b.position || a.id.localeCompare(b.id),
    );
  return after[0] ?? null;
}

interface RewardBase {
  ruleId: string;
  ruleCode: string;
  score: number;
}

/**
 * Moteur de règles et de récompenses. Il relie un événement interne (partie
 * terminée, quiz réussi, défi gagné, série de jours) à une récompense (cours
 * avancé, badge, XP), en évaluant les conditions côté serveur à partir des
 * résultats enregistrés — jamais de données envoyées par le navigateur.
 *
 * Idempotence stricte : une règle ne s'applique qu'une fois par joueur et par
 * partie. La garantie réelle est l'index unique
 * `uq_academy_rule_applications_scope` ; le service vérifie d'abord puis
 * s'appuie sur la contrainte en cas de course concurrente.
 */
@Injectable()
export class AcademyRulesService {
  private readonly logger = new Logger(AcademyRulesService.name);

  constructor(
    @InjectRepository(AcademyUnlockRule)
    private readonly rules: Repository<AcademyUnlockRule>,
    @InjectRepository(AcademyRuleApplication)
    private readonly applications: Repository<AcademyRuleApplication>,
    @InjectRepository(AcademyUserUnlock)
    private readonly unlocks: Repository<AcademyUserUnlock>,
    @InjectRepository(AcademyUserBadge)
    private readonly userBadges: Repository<AcademyUserBadge>,
    @InjectRepository(AcademyBadge)
    private readonly badges: Repository<AcademyBadge>,
    @InjectRepository(AcademyCourse)
    private readonly courses: Repository<AcademyCourse>,
    private readonly progress: AcademyProgressService,
  ) {}

  /**
   * Traite un événement interne : évalue toutes les règles actives concernées
   * et accorde les récompenses. Renvoie la liste de ce qui a été accordé.
   */
  async processEvent(event: AcademyEvent): Promise<AcademyReward[]> {
    const rules = await this.loadApplicableRules(event);
    const rewards: AcademyReward[] = [];
    for (const rule of rules) {
      const reward = await this.applyRule(rule, event);
      if (reward) rewards.push(reward);
    }
    return rewards;
  }

  /**
   * Attribue un badge par son code, de façon idempotente. Utilisé pour les
   * badges de niveau (attribués quand tous les cours d'un niveau sont validés).
   * Renvoie `true` seulement si le badge vient d'être accordé : un badge déjà
   * possédé, un code inconnu ou une insertion concurrente renvoient `false`.
   */
  async awardBadgeByCode(userId: string, code: string): Promise<boolean> {
    const badge = await this.badges.findOne({ where: { code } });
    if (!badge) return false;

    const owned = await this.userBadges.count({ where: { userId, badgeId: badge.id } });
    if (owned > 0) return false;

    try {
      await this.userBadges.save(
        this.userBadges.create({ userId, badgeId: badge.id, ruleId: null }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return false;
    }
    return true;
  }

  private async loadApplicableRules(event: AcademyEvent): Promise<AcademyUnlockRule[]> {
    const rules = await this.rules.find({
      where: { triggerEvent: event.type, isActive: true },
      order: { priority: 'DESC', createdAt: 'ASC' },
    });
    return rules.filter(
      (rule) => rule.missionId === null || rule.missionId === event.missionId,
    );
  }

  private async applyRule(rule: AcademyUnlockRule, event: AcademyEvent): Promise<AcademyReward | null> {
    if (await this.alreadyApplied(rule.id, event.userId, event.roomId ?? null)) return null;

    const conditions = readRuleConditions(rule.conditions);
    const evaluation = evaluateRuleConditions(conditions, event.metrics, {
      scenarioId: event.scenarioId ?? null,
      streakDays: this.readStreak(event),
    });
    if (!evaluation.passed) return null;

    const base: RewardBase = { ruleId: rule.id, ruleCode: rule.code, score: evaluation.score };
    const reward = await this.grant(rule, event, base);
    const recorded = await this.record(rule, event, reward);
    return recorded ? reward : null;
  }

  private async alreadyApplied(ruleId: string, userId: string, roomId: string | null): Promise<boolean> {
    const where = roomId
      ? { ruleId, userId, roomId }
      : { ruleId, userId, roomId: IsNull() };
    return (await this.applications.count({ where })) > 0;
  }

  /**
   * Accord effectif de la récompense. Aucun XP n'est crédité ici : il est
   * rattaché au journal d'application (`record`), dans un seul endroit.
   */
  private async grant(
    rule: AcademyUnlockRule,
    event: AcademyEvent,
    base: RewardBase,
  ): Promise<AcademyReward> {
    switch (rule.rewardType) {
      case 'xp':
        return {
          ...base,
          rewardType: 'xp',
          status: 'granted',
          xp: rule.xpAmount > 0 ? rule.xpAmount : DEFAULT_REWARD_XP,
        };
      case 'badge':
        return this.grantBadge(rule, event, base);
      case 'course':
        return this.grantCourse(rule, event, base);
      case 'course_choice':
        // Récompense « au choix parmi 2-3 cours » : réservée, non construite.
        return {
          ...base,
          rewardType: 'course_choice',
          status: 'pending_choice',
          xp: 0,
          note: 'Choix de cours à venir (réservé).',
        };
      default:
        return this.convertToXp(base, 'Type de récompense inconnu.');
    }
  }

  private async grantBadge(
    rule: AcademyUnlockRule,
    event: AcademyEvent,
    base: RewardBase,
  ): Promise<AcademyReward> {
    const badgeId = rule.rewardBadgeId;
    if (!badgeId) return this.convertToXp(base, 'Badge cible manquant.');

    const owned = await this.userBadges.count({ where: { userId: event.userId, badgeId } });
    if (owned > 0) return this.convertToXp(base, 'Badge déjà obtenu : converti en XP.');

    const badge = await this.badges.findOne({ where: { id: badgeId } });
    if (!badge) return this.convertToXp(base, 'Badge introuvable.');

    try {
      await this.userBadges.save(
        this.userBadges.create({ userId: event.userId, badgeId, ruleId: rule.id }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    return {
      ...base,
      rewardType: 'badge',
      status: 'granted',
      xp: 0,
      badgeId,
      badgeCode: badge.code,
    };
  }

  private async grantCourse(
    rule: AcademyUnlockRule,
    event: AcademyEvent,
    base: RewardBase,
  ): Promise<AcademyReward> {
    const courseId = rule.rewardCourseId;
    if (!courseId) return this.convertToXp(base, 'Cours cible manquant.');

    const unlocked = await this.unlockedCourseIds(event.userId);
    if (!unlocked.has(courseId)) {
      await this.ensureUnlock(event.userId, courseId, rule.id, event.roomId ?? null);
      return { ...base, rewardType: 'course', status: 'granted', xp: 0, courseId };
    }

    const course = await this.courses.findOne({ where: { id: courseId } });
    if (!course) return this.convertToXp(base, 'Cours cible introuvable.');
    const next = selectNextCourse(await this.courses.find(), course, unlocked);
    if (!next) {
      return this.convertToXp(base, 'Récompense déjà possédée : convertie en XP.');
    }

    await this.ensureUnlock(event.userId, next.id, rule.id, event.roomId ?? null);
    return {
      ...base,
      rewardType: 'course',
      status: 'granted',
      xp: 0,
      courseId: next.id,
      note: 'Cours suivant offert (récompense déjà possédée).',
    };
  }

  private convertToXp(base: RewardBase, note: string): AcademyReward {
    return { ...base, rewardType: 'xp', status: 'converted_to_xp', xp: DEFAULT_REWARD_XP, note };
  }

  /** Enregistre le déblocage, en ignorant une éventuelle contrainte d'unicité. */
  private async ensureUnlock(
    userId: string,
    courseId: string,
    ruleId: string,
    roomId: string | null,
  ): Promise<void> {
    try {
      await this.unlocks.save(
        this.unlocks.create({ userId, courseId, source: 'reward', ruleId, roomId }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  /**
   * Journalise l'application (garantie d'idempotence) puis crédite l'XP. Si
   * l'index unique rejette l'insertion, la règle a déjà été appliquée entre-temps :
   * l'appel renvoie false et rien n'est accordé une seconde fois.
   */
  private async record(
    rule: AcademyUnlockRule,
    event: AcademyEvent,
    reward: AcademyReward,
  ): Promise<boolean> {
    try {
      await this.applications.save(
        this.applications.create({
          ruleId: rule.id,
          userId: event.userId,
          roomId: event.roomId ?? null,
          resultId: event.resultId ?? null,
          reward: {
            type: reward.rewardType,
            status: reward.status,
            courseId: reward.courseId ?? null,
            badgeId: reward.badgeId ?? null,
            xp: reward.xp,
          },
          xpAwarded: reward.xp,
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
    if (reward.xp > 0) await this.progress.addXp(event.userId, reward.xp);
    return true;
  }

  private readStreak(event: AcademyEvent): number | null {
    const value = event.payload?.streakDays;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private async unlockedCourseIds(userId: string): Promise<Set<string>> {
    const rows = await this.unlocks.find({ where: { userId } });
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.courseId) ids.add(row.courseId);
    }
    return ids;
  }
}
