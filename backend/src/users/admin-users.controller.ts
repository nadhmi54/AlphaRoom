import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Auth } from './auth.decorator.js';
import { CurrentProfile } from './current-profile.decorator.js';
import {
  ChangeRoleDto,
  ListUsersQueryDto,
  PaginationQueryDto,
  SetStatusDto,
} from './dto/admin.dto.js';
import type { Profile } from './profile.entity.js';
import { UserRole } from './user-role.enum.js';
import { type AuditEntry, type Paginated, UsersService } from './users.service.js';

/** Administration des comptes — réservée au rôle `admin`. */
@Auth(UserRole.ADMIN)
@Controller('admin')
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get('users')
  list(@Query() query: ListUsersQueryDto): Promise<Paginated<Profile>> {
    return this.users.list(query);
  }

  @Get('users/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Profile> {
    return this.users.findOne(id);
  }

  @Patch('users/:id/role')
  changeRole(
    @CurrentProfile() actor: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRoleDto,
  ): Promise<Profile> {
    return this.users.changeRole(actor.id, id, dto.role);
  }

  @Patch('users/:id/status')
  setStatus(
    @CurrentProfile() actor: Profile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStatusDto,
  ): Promise<Profile> {
    return this.users.setActive(actor.id, id, dto.isActive);
  }

  @Get('audit-logs')
  audit(@Query() query: PaginationQueryDto): Promise<Paginated<AuditEntry>> {
    return this.users.listAudit(query);
  }
}
