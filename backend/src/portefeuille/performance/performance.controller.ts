import { Controller, Get, ParseUUIDPipe, Param, Query } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { CurrentProfile } from '../../users/current-profile.decorator.js';
import type { Profile } from '../../users/profile.entity.js';
import { PerformanceHistoryQueryDto } from './dto/performance-history-query.dto.js';
import { PerformanceHistoryDto, PerformanceMetricsDto } from './dto/performance-response.dto.js';
import { PerformanceService } from './performance.service.js';

/**
 * Indicateurs de performance et de risque du portefeuille (module M3).
 * L'identifiant de l'URL est celui du portefeuille (`portfolio.id`), et non
 * celui du profil : le service vérifie la propriété avant de répondre.
 */
@Auth()
@Controller('portfolios')
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Get(':id/performance')
  current(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentProfile() profile: Profile,
  ): Promise<PerformanceMetricsDto> {
    return this.performance.getCurrent(id, profile.id);
  }

  @Get(':id/performance/history')
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentProfile() profile: Profile,
    @Query() query: PerformanceHistoryQueryDto,
  ): Promise<PerformanceHistoryDto> {
    return this.performance.getHistory(id, profile.id, query);
  }
}
