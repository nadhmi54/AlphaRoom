import { SetMetadata } from '@nestjs/common';
import type { UserRole } from './user-role.enum.js';

export const ROLES_KEY = 'alpharoom:roles';

/** Restreint une route aux rôles listés (le rôle `admin` n'est pas implicite). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
