import { Expose } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

const RULE_TRIGGERS = ['game_finished', 'quiz_passed', 'challenge_won', 'streak_days'] as const;
const RULE_REWARDS = ['course', 'badge', 'xp', 'course_choice'] as const;
const BADGE_KINDS = ['level', 'skill', 'achievement'] as const;

// ---------------------------------------------------------------------------
// Cours
// ---------------------------------------------------------------------------

export class CreateCourseDto {
  @IsString() @Length(1, 64) code!: string;
  @IsString() @Length(1, 160) title!: string;
  @IsOptional() @IsString() summary?: string | null;
  @IsOptional() @IsInt() @Min(1) level?: number;
  @IsOptional() @IsBoolean() isPremium?: boolean;
  @IsOptional() @IsString() unlockHint?: string | null;
  @IsOptional() @IsInt() @Min(0) position?: number;
}

export class UpdateCourseDto {
  @IsOptional() @IsString() @Length(1, 160) title?: string;
  @IsOptional() @IsString() summary?: string | null;
  @IsOptional() @IsInt() @Min(1) level?: number;
  @IsOptional() @IsBoolean() isPremium?: boolean;
  @IsOptional() @IsString() unlockHint?: string | null;
  @IsOptional() @IsInt() @Min(0) position?: number;
}

// ---------------------------------------------------------------------------
// Packs de récompenses
// ---------------------------------------------------------------------------

export class CreatePackDto {
  @IsString() @Length(1, 64) code!: string;
  @IsString() @Length(1, 160) title!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsBoolean() isPremium?: boolean;
  @IsOptional() @IsInt() @Min(0) position?: number;
}

export class UpdatePackDto {
  @IsOptional() @IsString() @Length(1, 160) title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsBoolean() isPremium?: boolean;
  @IsOptional() @IsInt() @Min(0) position?: number;
}

export class AddPackItemDto {
  @IsUUID('4', { message: 'Identifiant de cours invalide.' }) courseId!: string;
  @IsOptional() @IsInt() @Min(0) position?: number;
}

// ---------------------------------------------------------------------------
// Règles et seuils
// ---------------------------------------------------------------------------

export class CreateRuleDto {
  @IsString() @Length(1, 64) code!: string;
  @IsIn(RULE_TRIGGERS) triggerEvent!: (typeof RULE_TRIGGERS)[number];
  @IsOptional() @IsUUID('4') missionId?: string | null;
  @IsOptional() @IsObject() conditions?: Record<string, unknown>;
  @IsIn(RULE_REWARDS) rewardType!: (typeof RULE_REWARDS)[number];
  @IsOptional() @IsUUID('4') rewardCourseId?: string | null;
  @IsOptional() @IsUUID('4') rewardBadgeId?: string | null;
  @IsOptional() @IsInt() @Min(0) xpAmount?: number;
  @IsOptional() @IsArray() choiceOptions?: unknown[] | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() priority?: number;
}

export class UpdateRuleDto {
  @IsOptional() @IsIn(RULE_TRIGGERS) triggerEvent?: (typeof RULE_TRIGGERS)[number];
  @IsOptional() @IsUUID('4') missionId?: string | null;
  @IsOptional() @IsObject() conditions?: Record<string, unknown>;
  @IsOptional() @IsIn(RULE_REWARDS) rewardType?: (typeof RULE_REWARDS)[number];
  @IsOptional() @IsUUID('4') rewardCourseId?: string | null;
  @IsOptional() @IsUUID('4') rewardBadgeId?: string | null;
  @IsOptional() @IsInt() @Min(0) xpAmount?: number;
  @IsOptional() @IsArray() choiceOptions?: unknown[] | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() priority?: number;
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export class CreateBadgeDto {
  @IsString() @Length(1, 64) code!: string;
  @IsIn(BADGE_KINDS) kind!: (typeof BADGE_KINDS)[number];
  @IsString() @Length(1, 160) title!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() @Length(1, 64) icon?: string | null;
  @IsOptional() @IsInt() @Min(0) position?: number;
}

export class UpdateBadgeDto {
  @IsOptional() @IsIn(BADGE_KINDS) kind?: (typeof BADGE_KINDS)[number];
  @IsOptional() @IsString() @Length(1, 160) title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() @Length(1, 64) icon?: string | null;
  @IsOptional() @IsInt() @Min(0) position?: number;
}

// ---------------------------------------------------------------------------
// Missions et défis
// ---------------------------------------------------------------------------

export class CreateMissionDto {
  @IsString() @Length(1, 64) code!: string;
  @IsOptional() @IsInt() @Min(1) level?: number;
  @IsString() @Length(1, 160) title!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() @Length(1, 64) scenarioId?: string | null;
  @IsOptional() @IsObject() criteria?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isPlacement?: boolean;
  @IsOptional() @IsDateString() startsAt?: string | null;
  @IsOptional() @IsDateString() endsAt?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) position?: number;
}

export class UpdateMissionDto {
  @IsOptional() @IsInt() @Min(1) level?: number;
  @IsOptional() @IsString() @Length(1, 160) title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() @Length(1, 64) scenarioId?: string | null;
  @IsOptional() @IsObject() criteria?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isPlacement?: boolean;
  @IsOptional() @IsDateString() startsAt?: string | null;
  @IsOptional() @IsDateString() endsAt?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) position?: number;
}

// ---------------------------------------------------------------------------
// Réponses d'administration
// ---------------------------------------------------------------------------

export class CourseAdminDto {
  @Expose() id!: string;
  @Expose() code!: string;
  @Expose() title!: string;
  @Expose() summary!: string | null;
  @Expose() level!: number;
  @Expose() isPremium!: boolean;
  @Expose() unlockHint!: string | null;
  @Expose() position!: number;
}

export class PackAdminDto {
  @Expose() id!: string;
  @Expose() code!: string;
  @Expose() title!: string;
  @Expose() description!: string | null;
  @Expose() isPremium!: boolean;
  @Expose() position!: number;
}

export class PackItemAdminDto {
  @Expose() id!: string;
  @Expose() packId!: string;
  @Expose() courseId!: string;
  @Expose() position!: number;
}

export class RuleAdminDto {
  @Expose() id!: string;
  @Expose() code!: string;
  @Expose() triggerEvent!: string;
  @Expose() missionId!: string | null;
  @Expose() conditions!: Record<string, unknown>;
  @Expose() rewardType!: string;
  @Expose() rewardCourseId!: string | null;
  @Expose() rewardBadgeId!: string | null;
  @Expose() xpAmount!: number;
  @Expose() choiceOptions!: unknown[] | null;
  @Expose() isActive!: boolean;
  @Expose() priority!: number;
}

export class BadgeAdminDto {
  @Expose() id!: string;
  @Expose() code!: string;
  @Expose() kind!: string;
  @Expose() title!: string;
  @Expose() description!: string | null;
  @Expose() icon!: string | null;
  @Expose() position!: number;
}

export class MissionAdminDto {
  @Expose() id!: string;
  @Expose() code!: string;
  @Expose() level!: number;
  @Expose() title!: string;
  @Expose() description!: string | null;
  @Expose() scenarioId!: string | null;
  @Expose() criteria!: Record<string, unknown>;
  @Expose() isPlacement!: boolean;
  @Expose() startsAt!: Date | null;
  @Expose() endsAt!: Date | null;
  @Expose() isActive!: boolean;
  @Expose() position!: number;
}
