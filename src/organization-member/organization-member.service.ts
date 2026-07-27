import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateOrganizationMemberDto } from './dto/create-organization-member.dto';
import { UpdateOrganizationMemberDto } from './dto/update-organization-member.dto';
import {
  OrganizationMember,
  OrganizationMemberDocument,
} from './schemas/organization-member.schema';
import { OrganizationRole } from '../common/enums/organization-role.enum';
import { AuditService } from '../common/audit/audit.service';
import { AuditAction } from '../common/audit/audit-action.enum';
import {
  AuditContext,
  systemAuditContext,
} from '../common/audit/audit-context';
import { snapshot } from '../common/audit/audit-redaction';

const TARGET_TYPE = 'organization_member';
const MEMBER_AUDIT_FIELDS = ['organizationId', 'userId', 'role'] as const;

@Injectable()
export class OrganizationMemberService {
  constructor(
    @InjectModel(OrganizationMember.name)
    private readonly memberModel: Model<OrganizationMemberDocument>,
    private readonly auditService: AuditService,
  ) {}

  async addMember(
    payload: CreateOrganizationMemberDto,
    audit?: AuditContext,
  ): Promise<OrganizationMember> {
    const existing = await this.memberModel
      .findOne({
        organizationId: payload.organizationId,
        userId: payload.userId,
      })
      .exec();
    if (existing) {
      throw new ConflictException(
        'User is already a member of this organization',
      );
    }

    const member = await new this.memberModel(payload).save();

    await this.auditService.record({
      action: AuditAction.ORGANIZATION_MEMBER_ADDED,
      context: audit ?? systemAuditContext(),
      target: { type: TARGET_TYPE, id: member.id },
      before: null,
      after: snapshot(member, MEMBER_AUDIT_FIELDS),
    });

    return member;
  }

  async findByOrganization(
    organizationId: string,
  ): Promise<OrganizationMember[]> {
    return this.memberModel.find({ organizationId }).exec();
  }

  /**
   * Memberships for a user. Callers may only read their own memberships unless
   * `requesterIsPlatformAdmin` — otherwise any authenticated user could
   * enumerate which organizations another user belongs to.
   */
  async findByUser(
    userId: string,
    requesterId: string,
    requesterIsPlatformAdmin = false,
  ): Promise<OrganizationMember[]> {
    if (!requesterIsPlatformAdmin && userId !== requesterId) {
      throw new ForbiddenException(
        'You may only list your own organization memberships',
      );
    }
    return this.memberModel.find({ userId }).exec();
  }

  async findOne(id: string): Promise<OrganizationMemberDocument> {
    const member = await this.memberModel.findById(id).exec();
    if (!member) {
      throw new NotFoundException('Organization member not found');
    }
    return member;
  }

  /**
   * Changes a membership role.
   *
   * `owner` is handled specially: only an existing owner may grant or revoke
   * it, and the last remaining owner cannot be demoted, so an organization is
   * never left without an administrator.
   */
  async updateRole(
    id: string,
    payload: UpdateOrganizationMemberDto,
    actorRole?: OrganizationRole,
    audit?: AuditContext,
  ): Promise<OrganizationMember> {
    const existing = await this.findOne(id);
    const before = snapshot(existing, MEMBER_AUDIT_FIELDS);

    const nextRole = payload.role;
    if (!nextRole) {
      throw new BadRequestException('A role is required');
    }

    const touchesOwnership =
      nextRole === OrganizationRole.OWNER ||
      existing.role === OrganizationRole.OWNER;

    if (touchesOwnership && actorRole && actorRole !== OrganizationRole.OWNER) {
      throw new ForbiddenException(
        'Only an organization owner can grant or revoke the owner role',
      );
    }

    if (
      existing.role === OrganizationRole.OWNER &&
      nextRole !== OrganizationRole.OWNER
    ) {
      await this.assertNotLastOwner(existing.organizationId, id);
    }

    const member = await this.memberModel
      .findByIdAndUpdate(id, { role: nextRole }, { new: true })
      .exec();
    if (!member) {
      throw new NotFoundException('Organization member not found');
    }

    await this.auditService.record({
      action: AuditAction.ORGANIZATION_MEMBER_ROLE_CHANGED,
      context: audit ?? systemAuditContext(),
      target: { type: TARGET_TYPE, id },
      before,
      after: snapshot(member, MEMBER_AUDIT_FIELDS),
    });

    return member;
  }

  async removeMember(
    id: string,
    actorRole?: OrganizationRole,
    audit?: AuditContext,
  ): Promise<{ id: string; deleted: boolean }> {
    const existing = await this.findOne(id);

    if (
      existing.role === OrganizationRole.OWNER &&
      actorRole &&
      actorRole !== OrganizationRole.OWNER
    ) {
      throw new ForbiddenException(
        'Only an organization owner can remove another owner',
      );
    }

    if (existing.role === OrganizationRole.OWNER) {
      await this.assertNotLastOwner(existing.organizationId, id);
    }

    const result = await this.memberModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Organization member not found');
    }

    await this.auditService.record({
      action: AuditAction.ORGANIZATION_MEMBER_REMOVED,
      context: audit ?? systemAuditContext(),
      target: { type: TARGET_TYPE, id },
      before: snapshot(result, MEMBER_AUDIT_FIELDS),
      after: null,
    });

    return { id, deleted: true };
  }

  private async assertNotLastOwner(
    organizationId: string,
    excludeMembershipId: string,
  ): Promise<void> {
    const remainingOwners = await this.memberModel
      .countDocuments({
        organizationId,
        role: OrganizationRole.OWNER,
        _id: { $ne: excludeMembershipId },
      })
      .exec();

    if (remainingOwners === 0) {
      throw new BadRequestException(
        'An organization must retain at least one owner',
      );
    }
  }
}
