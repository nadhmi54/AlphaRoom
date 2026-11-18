import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { UserRole } from '../../users/user-role.enum.js';
import { AcademyAdminService } from './academy-admin.service.js';
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

/**
 * Administration du contenu de l'Academy, réservée au rôle administrateur.
 * L'administrateur crée et modifie cours, packs, règles et seuils, badges et
 * missions sans toucher au code. Le rôle vient de la table `profiles` (via
 * `RolesGuard`) : un jeton forgé ne suffit pas.
 */
@Auth(UserRole.ADMIN)
@Controller('academy/admin')
export class AcademyAdminController {
  constructor(private readonly admin: AcademyAdminService) {}

  // --- Cours ---------------------------------------------------------------

  @Post('courses')
  createCourse(@Body() dto: CreateCourseDto): Promise<CourseAdminDto> {
    return this.admin.createCourse(dto);
  }

  @Patch('courses/:id')
  updateCourse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCourseDto,
  ): Promise<CourseAdminDto> {
    return this.admin.updateCourse(id, dto);
  }

  // --- Packs ---------------------------------------------------------------

  @Post('packs')
  createPack(@Body() dto: CreatePackDto): Promise<PackAdminDto> {
    return this.admin.createPack(dto);
  }

  @Patch('packs/:id')
  updatePack(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePackDto,
  ): Promise<PackAdminDto> {
    return this.admin.updatePack(id, dto);
  }

  @Post('packs/:id/items')
  addPackItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPackItemDto,
  ): Promise<PackItemAdminDto> {
    return this.admin.addPackItem(id, dto);
  }

  @Delete('packs/:id/items/:itemId')
  @HttpCode(204)
  removePackItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    return this.admin.removePackItem(id, itemId);
  }

  // --- Règles et seuils ----------------------------------------------------

  @Post('rules')
  createRule(@Body() dto: CreateRuleDto): Promise<RuleAdminDto> {
    return this.admin.createRule(dto);
  }

  @Patch('rules/:id')
  updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRuleDto,
  ): Promise<RuleAdminDto> {
    return this.admin.updateRule(id, dto);
  }

  // --- Badges --------------------------------------------------------------

  @Post('badges')
  createBadge(@Body() dto: CreateBadgeDto): Promise<BadgeAdminDto> {
    return this.admin.createBadge(dto);
  }

  @Patch('badges/:id')
  updateBadge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBadgeDto,
  ): Promise<BadgeAdminDto> {
    return this.admin.updateBadge(id, dto);
  }

  // --- Missions et défis ---------------------------------------------------

  @Post('missions')
  createMission(@Body() dto: CreateMissionDto): Promise<MissionAdminDto> {
    return this.admin.createMission(dto);
  }

  @Patch('missions/:id')
  updateMission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMissionDto,
  ): Promise<MissionAdminDto> {
    return this.admin.updateMission(id, dto);
  }
}
