import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { OrgRole } from '../../membership/entities/membership.entity';
import { MembershipService } from '../../membership/membership.service';
import { ROLES_KEY } from '../decorator/roles.decorator';

@Injectable()
export class OrgRoleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private membershipService: MembershipService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<OrgRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: any }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const orgId =
      (request.body?.orgId as string) ||
      (request.params?.orgId as string) ||
      (request.params?.id as string) ||
      (request.query?.orgId as string);

    if (!orgId) {
      throw new ForbiddenException(
        'Organization context (orgId) missing from request',
      );
    }

    const currentUserId: string = user.id;

    if (!currentUserId) {
      throw new ForbiddenException('Invalid user token payload');
    }

    const membership = await this.membershipService.findByUserIdAndOrgId(
      currentUserId,
      orgId,
    );

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    const hasRole = requiredRoles.includes(membership.role);

    if (!hasRole) {
      throw new ForbiddenException(
        `You do not have permission. Required role: ${requiredRoles.join(' or ')}`,
      );
    }

    return true;
  }
}
