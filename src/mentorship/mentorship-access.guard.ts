import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { resolveAuditContext } from '../common/audit/audit-context';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { ForbiddenDomainException } from '../common/errors/domain.exception';
import type { Role } from '../common/enums/role.enum';
import type { MentorshipActor } from './mentorship.policy';

/**
 * Deny-by-default for every mentorship route: a handler (or its controller)
 * must declare `@Roles(...)` and the caller must hold one of them. Unlike
 * the shared RolesGuard, a missing declaration denies instead of allowing.
 * Object-level rules (participant-only access) live in the services.
 */
@Injectable()
export class MentorshipAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const user = context.switchToHttp().getRequest().user as
      | { sub?: string; role?: string }
      | undefined;

    if (!roles || roles.length === 0 || !user?.sub || !user.role) {
      throw new ForbiddenDomainException(
        'Access to this mentorship operation is not permitted',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    if (!roles.some((role) => role === user.role)) {
      throw new ForbiddenDomainException(
        'Your role cannot perform this mentorship operation',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    return true;
  }
}

/** Injects the authenticated {@link MentorshipActor} (identity + audit context). */
export const Actor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): MentorshipActor => {
    const request = ctx.switchToHttp().getRequest();
    return {
      userId: request.user.sub,
      platformRole: request.user.role,
      audit: resolveAuditContext(request),
    };
  },
);
