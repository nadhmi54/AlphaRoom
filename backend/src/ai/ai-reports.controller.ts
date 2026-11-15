import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { Auth } from '../users/auth.decorator.js';
import { CurrentProfile } from '../users/current-profile.decorator.js';
import type { Profile } from '../users/profile.entity.js';
import { UserRole } from '../users/user-role.enum.js';
import {
  EditReportDto,
  GenerateReportDto,
  ProgressQueryDto,
  ReportIdParams,
  ReportsQueryDto,
  UsageQueryDto,
  ValidateReportDto,
} from './dto/ai-report.dto.js';
import { AiReportsService } from './storage/ai-reports.service.js';

/**
 * Bilans pédagogiques. L'enseignant (game master ou admin) génère, corrige et
 * valide ; l'étudiant ne lit que son propre bilan, une fois validé et publié.
 */
@Controller('ai/reports')
export class AiReportsController {
  constructor(@Inject(AiReportsService) private readonly service: AiReportsService) {}

  @Auth(UserRole.GAME_MASTER, UserRole.ADMIN)
  @Post('generate')
  generate(@CurrentProfile() profile: Profile, @Body() dto: GenerateReportDto) {
    return this.service.generate(profile, dto);
  }

  @Auth()
  @Get()
  list(@CurrentProfile() profile: Profile, @Query() query: ReportsQueryDto) {
    return this.service.list(profile, query);
  }

  @Auth(UserRole.GAME_MASTER, UserRole.ADMIN)
  @Get('usage')
  usage(@CurrentProfile() profile: Profile, @Query() query: UsageQueryDto) {
    return this.service.usageSummary(profile, query.sessionId);
  }

  /** Avancement et notes de la classe sur un passage. */
  @Auth(UserRole.GAME_MASTER, UserRole.ADMIN)
  @Get('class-summary')
  classSummary(@CurrentProfile() profile: Profile, @Query() query: ReportsQueryDto) {
    return this.service.classSummary(profile, query);
  }

  /** Évolution des notes sur les bilans publiés (l'étudiant : les siens). */
  @Auth()
  @Get('progress')
  progress(@CurrentProfile() profile: Profile, @Query() query: ProgressQueryDto) {
    return this.service.progress(profile, query.participantId);
  }

  @Auth(UserRole.GAME_MASTER, UserRole.ADMIN)
  @Get(':id/history')
  history(@CurrentProfile() profile: Profile, @Param() params: ReportIdParams) {
    return this.service.history(profile, params.id);
  }

  @Auth()
  @Get(':id')
  get(@CurrentProfile() profile: Profile, @Param() params: ReportIdParams) {
    return this.service.get(profile, params.id);
  }

  @Auth(UserRole.GAME_MASTER, UserRole.ADMIN)
  @Patch(':id')
  edit(@CurrentProfile() profile: Profile, @Param() params: ReportIdParams, @Body() dto: EditReportDto) {
    return this.service.edit(profile, params.id, dto);
  }

  @Auth(UserRole.GAME_MASTER, UserRole.ADMIN)
  @Post(':id/validate')
  validate(@CurrentProfile() profile: Profile, @Param() params: ReportIdParams, @Body() dto: ValidateReportDto) {
    return this.service.validate(profile, params.id, dto.publish ?? false);
  }
}
