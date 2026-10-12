import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminAuditLog } from './admin-audit-log.entity.js';
import { Profile } from './profile.entity.js';
import { ProfileGuard } from './profile.guard.js';
import { RolesGuard } from './roles.guard.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

/**
 * Module utilisateur. @Global : les modules métier (marché, risque...)
 * peuvent utiliser `@Auth(...)` sans rien importer.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Profile, AdminAuditLog]), AuthModule],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService, ProfileGuard, RolesGuard],
  exports: [UsersService, ProfileGuard, RolesGuard],
})
export class UsersModule {}
