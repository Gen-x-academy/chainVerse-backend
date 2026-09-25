import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, isValidObjectId, Types } from 'mongoose';
import {
  AuthException,
  ErrorCode,
  ForbiddenDomainException,
  ResourceNotFoundException,
} from '../../common/errors';
import { Role } from '../../common/enums/role.enum';
import {
  FinanceMemberRole,
  FinancePermission,
  MEMBER_ROLE_PERMISSIONS,
} from '../domain/finance.enums';

export const FINANCE_PERMISSION_KEY = 'scholarshipFinancePermission';

/** Declare the finance permission a route requires within `:organizationId`. */
export const RequireFinancePermission = (permission: FinancePermission) =>
  SetMetadata(FINANCE_PERMISSION_KEY, permission);

/** A class (not an interface) so it can appear in decorated handler signatures. */
export class FinanceActorContext {
  userId!: string;
  organizationId!: string;
  isPlatformAdmin!: boolean;
  permissions!: FinancePermission[];
}

interface FinanceRequest {
  user?: { id?: string; role?: string };
  params?: Record<string, string | undefined>;
  financeActor?: FinanceActorContext;
}

/** Injects the resolved actor (set by FinanceAccessGuard) into a handler. */
export const FinanceActor = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): FinanceActorContext | undefined =>
    ctx.switchToHttp().getRequest<FinanceRequest>().financeActor,
);

/**
 * Tenant-scoped authorization for scholarship finance. Must run after
 * JwtAuthGuard. A caller is authorized for `:organizationId` when they are a
 * platform admin, or an active member of that organization whose finance
 * role grants the required permission. Every service call is then scoped by
 * the same organizationId, so records from other tenants are unreachable.
 */
@Injectable()
export class FinanceAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<FinancePermission>(
      FINANCE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest<FinanceRequest>();
    const user = request.user;
    const organizationId = request.params?.organizationId;

    if (!user?.id) {
      throw new AuthException(
        'User not authenticated',
        ErrorCode.AUTH_MISSING_TOKEN,
      );
    }
    if (!organizationId || !isValidObjectId(organizationId)) {
      throw new ResourceNotFoundException(
        'Organization not found',
        ErrorCode.RES_ORGANIZATION_NOT_FOUND,
      );
    }

    const org = await this.connection
      .collection('organizations')
      .findOne(
        { _id: new Types.ObjectId(organizationId) },
        { projection: { _id: 1 } },
      );
    if (!org) {
      throw new ResourceNotFoundException(
        'Organization not found',
        ErrorCode.RES_ORGANIZATION_NOT_FOUND,
      );
    }

    let permissions: FinancePermission[];
    const isPlatformAdmin = user.role === Role.ADMIN;
    if (isPlatformAdmin) {
      permissions = Object.values(FinancePermission);
    } else {
      const membership = await this.connection
        .collection('organizationmembers')
        .findOne(
          { organizationId, userId: user.id, deletedAt: null },
          { projection: { role: 1 } },
        );
      permissions =
        MEMBER_ROLE_PERMISSIONS[membership?.role as FinanceMemberRole] ?? [];
    }

    if (!required || !permissions.includes(required)) {
      throw new ForbiddenDomainException(
        'Insufficient scholarship finance permissions for this organization',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }

    const actor: FinanceActorContext = {
      userId: user.id,
      organizationId,
      isPlatformAdmin,
      permissions,
    };
    request.financeActor = actor;
    return true;
  }
}
