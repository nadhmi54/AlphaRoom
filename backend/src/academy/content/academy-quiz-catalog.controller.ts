import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { CurrentProfile } from '../../users/current-profile.decorator.js';
import type { Profile } from '../../users/profile.entity.js';
import { AcademyQuizCatalogService } from './academy-quiz-catalog.service.js';
import type { QuizSummaryDto } from './dto/quiz-summary.dto.js';

/**
 * Quiz disponibles dans un cours. Réservé aux personnes connectées, et refusé
 * si le cours est verrouillé pour le joueur (même règle que le contenu).
 */
@Auth()
@Controller('academy')
export class AcademyQuizCatalogController {
  constructor(private readonly catalog: AcademyQuizCatalogService) {}

  @Get('courses/:id/quizzes')
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentProfile() profile: Profile,
  ): Promise<QuizSummaryDto[]> {
    return this.catalog.listCourseQuizzes(id, profile.id);
  }
}
