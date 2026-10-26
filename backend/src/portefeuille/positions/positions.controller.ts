import { Body, Controller, Get, Inject, Param, Patch, Query } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { CurrentProfile } from '../../users/current-profile.decorator.js';
import type { Profile } from '../../users/profile.entity.js';
import { PositionsQueryDto } from './dto/positions-query.dto.js';
import { PositionsService } from './positions.service.js';
import { UpdateProtectionDto } from './dto/update-protection.dto.js';

@Auth()
@Controller('portfolio')
export class PositionsController {
  constructor(@Inject(PositionsService) private readonly positions: PositionsService) {}

  @Get('positions') list(
    @CurrentProfile() profile: Profile,
    @Query() query: PositionsQueryDto,
  ) {
    return this.positions.getPositions(profile.id, query.status);
  }

  @Get('allocation') allocation(@CurrentProfile() profile: Profile) {
    return this.positions.getAllocation(profile.id);
  }

  @Patch('positions/:symbol/protection') updateProtection(
    @CurrentProfile() profile: Profile,
    @Param('symbol') symbol: string,
    @Body() dto: UpdateProtectionDto,
  ) {
    return this.positions.updateProtection(profile.id, symbol, dto);
  }
}
