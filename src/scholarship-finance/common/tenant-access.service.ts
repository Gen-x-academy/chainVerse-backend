import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ErrorCode, ForbiddenDomainException } from '../../common/errors';
import { Role } from '../../common/enums/role.enum';
import {
  OrganizationMembership,
  OrganizationMembershipDocument,
} from './organization-membership.schema';
import { AuthenticatedUser } from './authenticated-user';

/** Organization-member roles allowed to read scholarship finance data. */
export const FINANCE_READ_ROLES = ['owner', 'admin', 'finance', 'auditor'];
/** Organization-member roles allowed to post entries, create payouts, reconcile. */
export const FINANCE_WRITE_ROLES = ['owner', 'admin', 'finance'];

/**
 * Enforces tenant ownership for the scholarship finance domain.
 *
 * Platform admins may act on any organization. Every other caller must be an
 * active member of the organization that owns the resource, with a finance
 * role. Resource lookups always filter by `organizationId` as well, so a
 * valid membership in organization A never exposes organization B's data.
 */
@Injectable()
export class TenantAccessService {
  constructor(
    @InjectModel(OrganizationMembership.name)
    private readonly memberModel: Model<OrganizationMembershipDocument>,
  ) {}

  async assertCanRead(user: AuthenticatedUser, organizationId: string) {
    await this.assertMembership(user, organizationId, FINANCE_READ_ROLES);
  }

  async assertCanWrite(user: AuthenticatedUser, organizationId: string) {
    await this.assertMembership(user, organizationId, FINANCE_WRITE_ROLES);
  }

  async canRead(user: AuthenticatedUser, organizationId: string) {
    try {
      await this.assertCanRead(user, organizationId);
      return true;
    } catch {
      return false;
    }
  }

  private async assertMembership(
    user: AuthenticatedUser,
    organizationId: string,
    roles: string[],
  ) {
    if (user.role === (Role.ADMIN as string)) return;

    const membership = await this.memberModel
      .findOne({
        organizationId,
        userId: user.id,
        role: { $in: roles },
        deletedAt: null,
      })
      .lean()
      .exec();

    if (!membership) {
      throw new ForbiddenDomainException(
        'You do not have finance access to this organization',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
  }
}
