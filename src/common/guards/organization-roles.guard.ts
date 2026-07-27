import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ORG_ROLES_KEY,
  ORG_SCOPE_KEY,
  OrgScopeOptions,
} from '../decorators/org-roles.decorator';
import {
  isOrganizationRole,
  OrganizationRole,
} from '../enums/organization-role.enum';
import { Role } from '../enums/role.enum';
import {
  OrganizationMember,
  OrganizationMemberDocument,
} from '../../organization-member/schemas/organization-member.schema';

/** Membership resolved by the guard, attached to the request for handlers. */
export interface ResolvedOrgMembership {
  organizationId: string;
  role: OrganizationRole;
  /** True when access was granted by the platform `admin` role, not a membership. */
  viaPlatformAdmin: boolean;
}

export interface RequestWithOrgMembership {
  organizationMembership?: ResolvedOrgMembership;
}

/**
 * Enforces organization-scoped authorization.
 *
 * A global role alone never grants organization powers — the caller must hold a
 * membership in the *specific* organization the request targets, with one of the
 * roles listed by `@OrgRoles`. Platform `admin` retains a documented break-glass
 * bypass so support staff can administer any tenant; that path is flagged on the
 * resolved membership so callers can audit it.
 *
 * Requires `@OrgScope` on the handler to locate the organization id.
 */
@Injectable()
export class OrganizationRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(OrganizationMember.name)
    private readonly memberModel: Model<OrganizationMemberDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<OrganizationRole[]>(
      ORG_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const scope = this.reflector.getAllAndOverride<OrgScopeOptions>(
      ORG_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!scope) {
      // A misconfigured route must fail closed rather than allow the request.
      throw new InternalServerErrorException(
        'Organization scope is not configured for this route',
      );
    }

    const request = context.switchToHttp().getRequest();
    const user = request?.user as
      | { sub?: string; id?: string; role?: string }
      | undefined;

    if (!user || !(user.sub || user.id)) {
      throw new UnauthorizedException('Authentication is required');
    }

    const userId = String(user.sub ?? user.id);
    const organizationId = await this.resolveOrganizationId(request, scope);

    if (!organizationId) {
      throw new ForbiddenException(
        'Organization could not be determined for this request',
      );
    }

    const membership = await this.memberModel
      .findOne({ organizationId, userId, deletedAt: null })
      .exec();

    if (membership && isOrganizationRole(membership.role)) {
      const role = membership.role;
      if (requiredRoles.includes(role)) {
        this.attach(request, {
          organizationId,
          role,
          viaPlatformAdmin: false,
        });
        return true;
      }

      throw new ForbiddenException(
        `Organization role "${role}" is not permitted to perform this action`,
      );
    }

    // Break-glass: platform administrators may act on any organization.
    if (user.role === Role.ADMIN) {
      this.attach(request, {
        organizationId,
        role: OrganizationRole.OWNER,
        viaPlatformAdmin: true,
      });
      return true;
    }

    throw new ForbiddenException('You are not a member of this organization');
  }

  private attach(
    request: RequestWithOrgMembership,
    membership: ResolvedOrgMembership,
  ): void {
    request.organizationMembership = membership;
  }

  private async resolveOrganizationId(
    request: {
      params?: Record<string, unknown>;
      body?: Record<string, unknown>;
      query?: Record<string, unknown>;
    },
    scope: OrgScopeOptions,
  ): Promise<string | null> {
    const read = (bag?: Record<string, unknown>): string | null => {
      const value = bag?.[scope.key];
      return typeof value === 'string' && value.length > 0 ? value : null;
    };

    switch (scope.source) {
      case 'param':
        return read(request.params);
      case 'body':
        return read(request.body);
      case 'query':
        return read(request.query);
      case 'membershipParam': {
        const membershipId = read(request.params);
        if (!membershipId) return null;
        const member = await this.memberModel
          .findOne({ _id: membershipId, deletedAt: null })
          .exec();
        return member?.organizationId ?? null;
      }
      default:
        return null;
    }
  }
}
