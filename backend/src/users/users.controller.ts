import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Auth } from './auth.decorator.js';
import { CurrentProfile } from './current-profile.decorator.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import type { Profile } from './profile.entity.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Profil de l'utilisateur connecté (créé à la première connexion). */
  @Auth()
  @Get('me')
  me(@CurrentProfile() profile: Profile): Profile {
    return profile;
  }

  /** Mise à jour du profil — le rôle et le statut ne sont pas modifiables ici. */
  @Auth()
  @Patch('me')
  updateMe(@CurrentProfile() profile: Profile, @Body() dto: UpdateProfileDto): Promise<Profile> {
    return this.users.updateMe(profile, dto);
  }
}
