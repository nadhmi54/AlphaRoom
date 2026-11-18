import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { CurrentProfile } from '../../users/current-profile.decorator.js';
import type { Profile } from '../../users/profile.entity.js';
import { AcademyPathService } from './academy-path.service.js';
import type { PathDto } from './dto/path.dto.js';
import type { QuizDto } from '../content/dto/quiz.dto.js';

/**
 * Parcours par niveau et tirage d'un quiz de cours. Le tirage est fait côté
 * serveur (`POST /academy/courses/:id/quiz`) : le joueur ne choisit jamais le
 * quiz, et le cours verrouillé est refusé par les mêmes règles que le contenu.
 */
@Auth()
@Controller('academy')
export class AcademyPathController {
  constructor(private readonly path: AcademyPathService) {}

  @Get('path')
  mine(@CurrentProfile() profile: Profile): Promise<PathDto> {
    return this.path.getPath(profile.id);
  }

  @Post('courses/:id/quiz')
  draw(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentProfile() profile: Profile,
  ): Promise<QuizDto> {
    return this.path.drawCourseQuiz(id, profile.id);
  }
}
