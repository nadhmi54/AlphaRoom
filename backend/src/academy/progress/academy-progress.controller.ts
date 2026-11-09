import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { CurrentProfile } from '../../users/current-profile.decorator.js';
import type { Profile } from '../../users/profile.entity.js';
import { AcademyProgressService } from './academy-progress.service.js';
import { UpdateLessonProgressDto, type MyProgressDto } from './dto/progress.dto.js';

/**
 * Progression d'un élève : XP, niveau et avancement par compétence. La
 * progression est toujours celle du profil du JWT — aucun identifiant
 * d'utilisateur n'est accepté en entrée.
 */
@Auth()
@Controller('academy')
export class AcademyProgressController {
  constructor(private readonly progress: AcademyProgressService) {}

  @Get('progress/me')
  mine(@CurrentProfile() profile: Profile): Promise<MyProgressDto> {
    return this.progress.getMyProgress(profile.id);
  }

  @Put('lessons/:id/progress')
  updateLesson(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentProfile() profile: Profile,
    @Body() dto: UpdateLessonProgressDto,
  ): Promise<void> {
    return this.progress.updateLessonProgress(profile.id, id, dto);
  }
}
