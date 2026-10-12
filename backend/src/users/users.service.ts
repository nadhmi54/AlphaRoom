import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, type Repository } from 'typeorm';
import type { SupabaseJwtPayload } from '../auth/supabase-user.js';
import { AdminAuditLog, type AuditAction } from './admin-audit-log.entity.js';
import type { ListUsersQueryDto, PaginationQueryDto } from './dto/admin.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';
import { DEFAULT_PREFERENCES, Profile } from './profile.entity.js';
import { UserRole } from './user-role.enum.js';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** Entrée du journal enrichie des e-mails (lisible côté interface d'admin). */
export type AuditEntry = AdminAuditLog & { actorEmail: string | null; targetEmail: string | null };

const PG_UNIQUE_VIOLATION = '23505';
/** On ne réécrit `last_login_at` qu'au plus une fois toutes les 5 minutes. */
const LOGIN_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 20;

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: string; driverError?: { code?: string } };
  return e.code === PG_UNIQUE_VIOLATION || e.driverError?.code === PG_UNIQUE_VIOLATION;
}

/** Échappe les jokers LIKE (% _ \) d'une saisie utilisateur. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function nameFromMetadata(identity: SupabaseJwtPayload): string | null {
  const meta = identity.user_metadata ?? {};
  const raw = meta['full_name'] ?? meta['name'];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, 80);
  return trimmed.length >= 2 ? trimmed : null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
    @InjectRepository(AdminAuditLog) private readonly audit: Repository<AdminAuditLog>,
  ) {}

  // ---------------------------------------------------------------- profil

  /**
   * Retourne le profil du compte Supabase authentifié, en le créant à la
   * première utilisation (rôle par défaut : trader). Le rôle n'est JAMAIS
   * déduit du JWT ni de l'e-mail : le premier admin est promu en SQL.
   */
  async getOrCreate(identity: SupabaseJwtPayload): Promise<Profile> {
    const existing = await this.profiles.findOneBy({ id: identity.sub });
    if (existing) return this.touch(existing, identity);

    const created = this.profiles.create({
      id: identity.sub,
      email: identity.email ?? '',
      fullName: nameFromMetadata(identity),
      username: null,
      avatarUrl: null,
      country: null,
      role: UserRole.TRADER,
      isActive: true,
      preferences: { ...DEFAULT_PREFERENCES },
      lastLoginAt: new Date(),
    });
    try {
      return await this.profiles.save(created);
    } catch (error) {
      // Deux requêtes simultanées à la première connexion : l'autre a gagné.
      if (isUniqueViolation(error)) {
        const winner = await this.profiles.findOneBy({ id: identity.sub });
        if (winner) return winner;
      }
      throw error;
    }
  }

  private async touch(profile: Profile, identity: SupabaseJwtPayload): Promise<Profile> {
    let dirty = false;
    if (identity.email && identity.email !== profile.email) {
      profile.email = identity.email;
      dirty = true;
    }
    const last = profile.lastLoginAt?.getTime() ?? 0;
    if (Date.now() - last > LOGIN_TOUCH_INTERVAL_MS) {
      profile.lastLoginAt = new Date();
      dirty = true;
    }
    return dirty ? this.profiles.save(profile) : profile;
  }

  async updateMe(profile: Profile, dto: UpdateProfileDto): Promise<Profile> {
    if (dto.fullName !== undefined) profile.fullName = dto.fullName;
    if (dto.username !== undefined) profile.username = dto.username;
    if (dto.avatarUrl !== undefined) profile.avatarUrl = dto.avatarUrl;
    if (dto.country !== undefined) profile.country = dto.country;
    if (dto.preferences) {
      profile.preferences = {
        ...DEFAULT_PREFERENCES,
        ...profile.preferences,
        ...Object.fromEntries(
          Object.entries(dto.preferences).filter(([, v]) => v !== undefined),
        ),
      };
    }
    try {
      return await this.profiles.save(profile);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Ce pseudo est déjà utilisé.');
      throw error;
    }
  }

  // -------------------------------------------------------- administration

  private page(query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    return { page, limit, skip: (page - 1) * limit };
  }

  async list(query: ListUsersQueryDto): Promise<Paginated<Profile>> {
    const { page, limit, skip } = this.page(query);
    const qb = this.profiles.createQueryBuilder('p');

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(p.email ILIKE :q ESCAPE '\\' OR p.full_name ILIKE :q ESCAPE '\\' OR p.username ILIKE :q ESCAPE '\\')`,
        { q: `%${escapeLike(search)}%` },
      );
    }
    if (query.role) qb.andWhere('p.role = :role', { role: query.role });
    if (query.isActive !== undefined) qb.andWhere('p.is_active = :active', { active: query.isActive });

    const [items, total] = await qb
      .orderBy('p.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: string): Promise<Profile> {
    const profile = await this.profiles.findOneBy({ id });
    if (!profile) throw new NotFoundException('Utilisateur introuvable.');
    return profile;
  }

  async changeRole(actorId: string, targetId: string, role: UserRole): Promise<Profile> {
    if (actorId === targetId) {
      throw new ForbiddenException('Vous ne pouvez pas modifier votre propre rôle.');
    }
    const target = await this.findOne(targetId);
    if (target.role === role) return target;

    if (target.role === UserRole.ADMIN) await this.assertAnotherActiveAdmin(target.id);

    const previous = target.role;
    target.role = role;
    const saved = await this.profiles.save(target);
    await this.log(actorId, targetId, 'role_changed', { from: previous, to: role });
    return saved;
  }

  async setActive(actorId: string, targetId: string, isActive: boolean): Promise<Profile> {
    if (actorId === targetId) {
      throw new ForbiddenException('Vous ne pouvez pas désactiver votre propre compte.');
    }
    const target = await this.findOne(targetId);
    if (target.isActive === isActive) return target;

    if (!isActive && target.role === UserRole.ADMIN) await this.assertAnotherActiveAdmin(target.id);

    target.isActive = isActive;
    const saved = await this.profiles.save(target);
    await this.log(actorId, targetId, isActive ? 'account_enabled' : 'account_disabled', null);
    return saved;
  }

  async listAudit(query: PaginationQueryDto): Promise<Paginated<AuditEntry>> {
    const { page, limit, skip } = this.page(query);
    const [rows, total] = await this.audit.findAndCount({
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const ids = [...new Set(rows.flatMap((r) => [r.actorId, r.targetId]))];
    const people = ids.length ? await this.profiles.find({ where: { id: In(ids) } }) : [];
    const emailOf = new Map(people.map((p) => [p.id, p.email]));
    const items = rows.map((r) => ({
      ...r,
      actorEmail: emailOf.get(r.actorId) ?? null,
      targetEmail: emailOf.get(r.targetId) ?? null,
    }));
    return { items, total, page, limit };
  }

  /** Garde-fou : on ne retire jamais le dernier administrateur actif. */
  private async assertAnotherActiveAdmin(excludedId: string): Promise<void> {
    const others = await this.profiles
      .createQueryBuilder('p')
      .where('p.role = :role', { role: UserRole.ADMIN })
      .andWhere('p.is_active = true')
      .andWhere('p.id <> :id', { id: excludedId })
      .getCount();
    if (others === 0) {
      throw new ConflictException('Il doit rester au moins un administrateur actif.');
    }
  }

  private async log(
    actorId: string,
    targetId: string,
    action: AuditAction,
    details: Record<string, unknown> | null,
  ): Promise<void> {
    await this.audit.save(this.audit.create({ id: randomUUID(), actorId, targetId, action, details }));
  }
}
