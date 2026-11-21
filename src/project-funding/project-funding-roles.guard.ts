import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectFundingRole } from './entities';
import { PROJECT_FUNDING_ROLES_KEY } from './project-funding-roles.decorator';

type FundingGuardRequest = {
  user?: { role?: unknown };
  headers?: Record<string, unknown>;
};

@Injectable()
export class ProjectFundingRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      ProjectFundingRole[]
    >(PROJECT_FUNDING_ROLES_KEY, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<FundingGuardRequest>();
    const role = request.user?.role;
    const tenantId = request.headers?.['x-tenant-id'];

    if (!requiredRoles || requiredRoles.length === 0) {
      throw new ForbiddenException('Project funding access is deny-by-default');
    }
    if (
      typeof role !== 'string' ||
      !requiredRoles.includes(role as ProjectFundingRole)
    ) {
      throw new ForbiddenException(
        'Insufficient permissions for project funding',
      );
    }
    if (typeof tenantId !== 'string' || tenantId.length === 0) {
      throw new ForbiddenException('A tenant boundary is required');
    }

    return true;
  }
}
