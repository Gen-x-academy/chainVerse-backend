import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ForbiddenDomainException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  isOrganizationRole,
  OrganizationRole,
} from '../../common/enums/organization-role.enum';
import { Role } from '../../common/enums/role.enum';
import {
  OrganizationMember,
  OrganizationMemberDocument,
} from '../../organization-member/schemas/organization-member.schema';
import {
  ScholarshipAward,
  ScholarshipAwardDocument,
} from '../schemas/scholarship-award.schema';
import {
  VerifierAssignment,
  VerifierAssignmentDocument,
} from '../schemas/verifier-assignment.schema';
import {
  EvidenceSubmitterType,
  VerifierAssignmentStatus,
} from '../scholarship.constants';
import { ScholarshipActor } from '../scholarship-actor';

const STAFF_ROLES: readonly OrganizationRole[] = [
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
];

/**
 * Tenant scoping and the authorization rules that `OrganizationRolesGuard`
 * cannot express on its own — chiefly, that an award recipient (usually not an
 * organization member) may act on their own award.
 */
@Injectable()
export class ScholarshipAccessService {
  constructor(
    @InjectModel(ScholarshipAward.name)
    private readonly awardModel: Model<ScholarshipAwardDocument>,
    @InjectModel(OrganizationMember.name)
    private readonly memberModel: Model<OrganizationMemberDocument>,
    @InjectModel(VerifierAssignment.name)
    private readonly assignmentModel: Model<VerifierAssignmentDocument>,
  ) {}

  /**
   * Loads an award only if it belongs to `organizationId`. A cross-tenant id
   * is indistinguishable from a missing one, so ids cannot be probed.
   */
  async requireAward(
    organizationId: string,
    awardId: string,
  ): Promise<ScholarshipAwardDocument> {
    const award = await this.awardModel
      .findOne({ _id: awardId, organizationId })
      .exec();
    if (!award) {
      throw new ResourceNotFoundException('Scholarship award not found');
    }
    return award;
  }

  async membershipRole(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationRole | null> {
    const member = await this.memberModel
      .findOne({ organizationId, userId, deletedAt: null })
      .exec();
    return member && isOrganizationRole(member.role) ? member.role : null;
  }

  isRecipient(award: ScholarshipAward, actor: ScholarshipActor): boolean {
    return award.recipientId === actor.userId;
  }

  /** Owner/admin of the award's organization, or platform admin break-glass. */
  async isStaff(
    award: ScholarshipAward,
    actor: ScholarshipActor,
  ): Promise<boolean> {
    if (actor.platformRole === Role.ADMIN) return true;
    const role =
      actor.orgRole ??
      (await this.membershipRole(award.organizationId, actor.userId));
    return role !== null && STAFF_ROLES.includes(role);
  }

  /**
   * Evidence may be submitted by the recipient, or by a trusted system — an
   * organization owner/admin integration account or a platform admin.
   */
  async resolveSubmitterType(
    award: ScholarshipAward,
    actor: ScholarshipActor,
  ): Promise<EvidenceSubmitterType> {
    if (this.isRecipient(award, actor)) return EvidenceSubmitterType.RECIPIENT;
    if (await this.isStaff(award, actor)) return EvidenceSubmitterType.SYSTEM;
    throw new ForbiddenDomainException(
      'Only the award recipient or a trusted organization system may submit evidence',
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
  }

  /** Recipient, organization staff, or a verifier actively assigned to the award. */
  async assertCanReadEvidence(
    award: ScholarshipAwardDocument,
    actor: ScholarshipActor,
    milestoneKey?: string,
  ): Promise<void> {
    if (this.isRecipient(award, actor)) return;
    if (await this.isStaff(award, actor)) return;
    if (await this.activeAssignment(award.id, actor.userId, milestoneKey)) {
      return;
    }
    throw new ForbiddenDomainException(
      'You may not view evidence for this award',
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
  }

  /** Active assignment for `verifierId` that covers `milestoneKey` (if given). */
  async activeAssignment(
    awardId: string,
    verifierId: string,
    milestoneKey?: string,
  ): Promise<VerifierAssignmentDocument | null> {
    const assignment = await this.assignmentModel
      .findOne({
        awardId,
        verifierId,
        status: VerifierAssignmentStatus.ACTIVE,
      })
      .exec();
    if (!assignment) return null;
    if (
      milestoneKey &&
      assignment.milestoneKeys.length > 0 &&
      !assignment.milestoneKeys.includes(milestoneKey)
    ) {
      return null;
    }
    return assignment;
  }
}
