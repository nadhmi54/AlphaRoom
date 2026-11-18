import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { CurrentProfile } from '../../users/current-profile.decorator.js';
import type { Profile } from '../../users/profile.entity.js';
import { AcademyQuizService } from './academy-quiz.service.js';
import { SubmitQuizDto } from './dto/quiz.dto.js';
import type { QuizDto, QuizResultDto } from './dto/quiz.dto.js';

/**
 * Passage d'un quiz. Les questions sont servies sans les réponses ; la copie est
 * corrigée côté serveur et le score retenu est celui calculé par le serveur.
 */
@Auth()
@Controller('academy')
export class AcademyQuizController {
  constructor(private readonly quizzes: AcademyQuizService) {}

  @Get('quizzes/:id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentProfile() profile: Profile,
  ): Promise<QuizDto> {
    return this.quizzes.getQuiz(id, profile.id);
  }

  @Post('quizzes/:id/submissions')
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentProfile() profile: Profile,
    @Body() dto: SubmitQuizDto,
  ): Promise<QuizResultDto> {
    return this.quizzes.submitQuiz(id, profile.id, dto);
  }
}
