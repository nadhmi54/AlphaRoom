import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { CurrentProfile } from '../../users/current-profile.decorator.js';
import type { Profile } from '../../users/profile.entity.js';
import { AcademyContentService } from './academy-content.service.js';
import type { CourseDetailDto, CourseSummaryDto } from './dto/course-response.dto.js';

/**
 * Catalogue pédagogique de l'Academy. Toute personne connectée peut consulter
 * le catalogue (les cours verrouillés y figurent, avec leur condition), mais le
 * contenu d'un cours verrouillé n'est servi que s'il est débloqué.
 */
@Auth()
@Controller('academy')
export class AcademyContentController {
  constructor(private readonly content: AcademyContentService) {}

  @Get('courses')
  list(@CurrentProfile() profile: Profile): Promise<CourseSummaryDto[]> {
    return this.content.listCatalog(profile.id);
  }

  @Get('courses/:id')
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentProfile() profile: Profile,
  ): Promise<CourseDetailDto> {
    return this.content.getCourse(id, profile.id);
  }
}
