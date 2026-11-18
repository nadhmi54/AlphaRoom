import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import type { ObjectLiteral, Repository } from 'typeorm';
import { AcademyCourse } from '../content/academy-course.entity.js';
import { AcademyPack } from '../rewards/academy-pack.entity.js';
import { AcademyPackItem } from '../rewards/academy-pack-item.entity.js';
import { AcademyUnlockRule } from '../rules/academy-unlock-rule.entity.js';
import { AcademyBadge } from '../badges/academy-badge.entity.js';
import { AcademyMission } from '../missions/academy-mission.entity.js';
import {
  AddPackItemDto,
  BadgeAdminDto,
  CourseAdminDto,
  CreateBadgeDto,
  CreateCourseDto,
  CreateMissionDto,
  CreatePackDto,
  CreateRuleDto,
  MissionAdminDto,
  PackAdminDto,
  PackItemAdminDto,
  RuleAdminDto,
  UpdateBadgeDto,
  UpdateCourseDto,
  UpdateMissionDto,
  UpdatePackDto,
  UpdateRuleDto,
} from './dto/admin.dto.js';

/** Erreur Postgres de violation de contrainte d'unicité. */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === UNIQUE_VIOLATION) return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.includes('duplicate key');
}

/**
 * Administration du contenu de l'Academy : cours, packs, règles et seuils,
 * badges, missions. Réservé au rôle administrateur (contrôleur protégé par
 * `@Auth(UserRole.ADMIN)`). Toutes les écritures passent par ici, de sorte que
 * l'administrateur pilote le contenu sans toucher au code.
 */
@Injectable()
export class AcademyAdminService {
  constructor(
    @InjectRepository(AcademyCourse)
    private readonly courses: Repository<AcademyCourse>,
    @InjectRepository(AcademyPack)
    private readonly packs: Repository<AcademyPack>,
    @InjectRepository(AcademyPackItem)
    private readonly packItems: Repository<AcademyPackItem>,
    @InjectRepository(AcademyUnlockRule)
    private readonly rules: Repository<AcademyUnlockRule>,
    @InjectRepository(AcademyBadge)
    private readonly badges: Repository<AcademyBadge>,
    @InjectRepository(AcademyMission)
    private readonly missions: Repository<AcademyMission>,
  ) {}

  // -------------------------------------------------------------------------
  // Cours
  // -------------------------------------------------------------------------

  async createCourse(dto: CreateCourseDto): Promise<CourseAdminDto> {
    const course = this.courses.create({
      code: dto.code,
      title: dto.title,
      summary: dto.summary ?? null,
      level: dto.level ?? 1,
      isPremium: dto.isPremium ?? false,
      unlockHint: dto.unlockHint ?? null,
      position: dto.position ?? 0,
    });
    return plainToInstance(CourseAdminDto, await this.saveUnique(this.courses, course, 'Un cours'));
  }

  async updateCourse(id: string, dto: UpdateCourseDto): Promise<CourseAdminDto> {
    const course = await this.requireCourse(id);
    this.patch(course, dto);
    return plainToInstance(CourseAdminDto, await this.saveUnique(this.courses, course, 'Un cours'));
  }

  // -------------------------------------------------------------------------
  // Packs
  // -------------------------------------------------------------------------

  async createPack(dto: CreatePackDto): Promise<PackAdminDto> {
    const pack = this.packs.create({
      code: dto.code,
      title: dto.title,
      description: dto.description ?? null,
      isPremium: dto.isPremium ?? true,
      position: dto.position ?? 0,
    });
    return plainToInstance(PackAdminDto, await this.saveUnique(this.packs, pack, 'Un pack'));
  }

  async updatePack(id: string, dto: UpdatePackDto): Promise<PackAdminDto> {
    const pack = await this.requirePack(id);
    this.patch(pack, dto);
    return plainToInstance(PackAdminDto, await this.saveUnique(this.packs, pack, 'Un pack'));
  }

  async addPackItem(packId: string, dto: AddPackItemDto): Promise<PackItemAdminDto> {
    await this.requirePack(packId);
    const course = await this.courses.findOne({ where: { id: dto.courseId } });
    if (!course) throw new NotFoundException('Cours introuvable.');

    const item = this.packItems.create({
      packId,
      courseId: dto.courseId,
      position: dto.position ?? 0,
    });
    try {
      return plainToInstance(PackItemAdminDto, await this.packItems.save(item));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Ce cours figure déjà dans ce pack.');
      }
      throw error;
    }
  }

  async removePackItem(packId: string, itemId: string): Promise<void> {
    const item = await this.packItems.findOne({ where: { id: itemId, packId } });
    if (!item) throw new NotFoundException('Élément de pack introuvable.');
    await this.packItems.remove(item);
  }

  // -------------------------------------------------------------------------
  // Règles et seuils
  // -------------------------------------------------------------------------

  async createRule(dto: CreateRuleDto): Promise<RuleAdminDto> {
    const rule = this.rules.create({
      code: dto.code,
      triggerEvent: dto.triggerEvent,
      missionId: dto.missionId ?? null,
      conditions: dto.conditions ?? {},
      rewardType: dto.rewardType,
      rewardCourseId: dto.rewardCourseId ?? null,
      rewardBadgeId: dto.rewardBadgeId ?? null,
      xpAmount: dto.xpAmount ?? 0,
      choiceOptions: dto.choiceOptions ?? null,
      isActive: dto.isActive ?? true,
      priority: dto.priority ?? 0,
    });
    return plainToInstance(RuleAdminDto, await this.saveUnique(this.rules, rule, 'Une règle'));
  }

  async updateRule(id: string, dto: UpdateRuleDto): Promise<RuleAdminDto> {
    const rule = await this.requireRule(id);
    this.patch(rule, dto);
    return plainToInstance(RuleAdminDto, await this.saveUnique(this.rules, rule, 'Une règle'));
  }

  // -------------------------------------------------------------------------
  // Badges
  // -------------------------------------------------------------------------

  async createBadge(dto: CreateBadgeDto): Promise<BadgeAdminDto> {
    const badge = this.badges.create({
      code: dto.code,
      kind: dto.kind,
      title: dto.title,
      description: dto.description ?? null,
      icon: dto.icon ?? null,
      position: dto.position ?? 0,
    });
    return plainToInstance(BadgeAdminDto, await this.saveUnique(this.badges, badge, 'Un badge'));
  }

  async updateBadge(id: string, dto: UpdateBadgeDto): Promise<BadgeAdminDto> {
    const badge = await this.requireBadge(id);
    this.patch(badge, dto);
    return plainToInstance(BadgeAdminDto, await this.saveUnique(this.badges, badge, 'Un badge'));
  }

  // -------------------------------------------------------------------------
  // Missions et défis
  // -------------------------------------------------------------------------

  async createMission(dto: CreateMissionDto): Promise<MissionAdminDto> {
    const mission = this.missions.create({
      code: dto.code,
      level: dto.level ?? 1,
      title: dto.title,
      description: dto.description ?? null,
      scenarioId: dto.scenarioId ?? null,
      criteria: dto.criteria ?? {},
      isPlacement: dto.isPlacement ?? false,
      startsAt: toDate(dto.startsAt),
      endsAt: toDate(dto.endsAt),
      isActive: dto.isActive ?? true,
      position: dto.position ?? 0,
    });
    return plainToInstance(
      MissionAdminDto,
      await this.saveUnique(this.missions, mission, 'Une mission'),
    );
  }

  async updateMission(id: string, dto: UpdateMissionDto): Promise<MissionAdminDto> {
    const mission = await this.requireMission(id);
    const { startsAt, endsAt, ...rest } = dto;
    this.patch(mission, rest);
    if (startsAt !== undefined) mission.startsAt = toDate(startsAt);
    if (endsAt !== undefined) mission.endsAt = toDate(endsAt);
    return plainToInstance(
      MissionAdminDto,
      await this.saveUnique(this.missions, mission, 'Une mission'),
    );
  }

  // -------------------------------------------------------------------------
  // Aides internes
  // -------------------------------------------------------------------------

  private async requireCourse(id: string): Promise<AcademyCourse> {
    const course = await this.courses.findOne({ where: { id } });
    if (!course) throw new NotFoundException('Cours introuvable.');
    return course;
  }

  private async requirePack(id: string): Promise<AcademyPack> {
    const pack = await this.packs.findOne({ where: { id } });
    if (!pack) throw new NotFoundException('Pack introuvable.');
    return pack;
  }

  private async requireRule(id: string): Promise<AcademyUnlockRule> {
    const rule = await this.rules.findOne({ where: { id } });
    if (!rule) throw new NotFoundException('Règle introuvable.');
    return rule;
  }

  private async requireBadge(id: string): Promise<AcademyBadge> {
    const badge = await this.badges.findOne({ where: { id } });
    if (!badge) throw new NotFoundException('Badge introuvable.');
    return badge;
  }

  private async requireMission(id: string): Promise<AcademyMission> {
    const mission = await this.missions.findOne({ where: { id } });
    if (!mission) throw new NotFoundException('Mission introuvable.');
    return mission;
  }

  /** Sauvegarde en traduisant une violation d'unicité en 409. */
  private async saveUnique<T extends ObjectLiteral>(
    repo: Repository<T>,
    entity: T,
    label: string,
  ): Promise<T> {
    try {
      return await repo.save(entity);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`${label} avec ce code existe déjà.`);
      }
      throw error;
    }
  }

  /** Applique uniquement les champs fournis (les `undefined` sont ignorés). */
  private patch<T extends object>(target: T, dto: object): void {
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) (target as Record<string, unknown>)[key] = value;
    }
  }
}

/** Convertit une date ISO (ou null/undefined) en `Date | null`. */
function toDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
