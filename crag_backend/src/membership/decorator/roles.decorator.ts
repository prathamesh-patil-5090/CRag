import { SetMetadata } from '@nestjs/common';
import { OrgRole } from '../../membership/entities/membership.entity';

export const ROLES_KEY = 'org_roles';
export const Roles = (...roles: OrgRole[]) => SetMetadata(ROLES_KEY, roles);
