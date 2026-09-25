import {
  Injectable,
  ConflictException,
  NotFoundException,
  GoneException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import {
  OrganizationInvitation,
  OrganizationInvitationDocument,
  InvitationStatus,
} from './schemas/organization-invitation.schema';
import {
  OrganizationMember,
  OrganizationMemberDocument,
} from './schemas/organization-member.schema';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { OrganizationRole } from '../common/enums/organization-role.enum';
import { AuditService } from '../common/audit/audit.service';
import { AuditAction } from '../common/audit/audit-action.enum';
import type { AuditContext } from '../common/audit/audit-context';
import { snapshot } from '../common/audit/audit-redaction';

const TARGET_TYPE = 'organization_invitation';
const INVITATION_AUDIT_FIELDS = [
  'organizationId',
  'email',
  'invitedBy',
  'status',
] as const;

const DEFAULT_EXPIRY_DAYS = 7;

@Injectable()
export class OrganizationInvitationService {
  constructor(
    @InjectModel(OrganizationInvitation.name)
    private readonly invitationModel: Model<OrganizationInvitationDocument>,
    @InjectModel(OrganizationMember.name)
    private readonly memberModel: Model<OrganizationMemberDocument>,
    private readonly auditService: AuditService,
  ) {}

  async create(
    dto: CreateInvitationDto,
    invitedByUserId: string,
    audit?: AuditContext,
    expiryDays = DEFAULT_EXPIRY_DAYS,
  ): Promise<OrganizationInvitation> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const existingInvitation = await this.invitationModel
      .findOne({
        organizationId: dto.organizationId,
        email: normalizedEmail,
        status: InvitationStatus.PENDING,
      })
      .exec();

    if (existingInvitation) {
      throw new ConflictException(
        'A pending invitation already exists for this email in this organization',
      );
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    const invitation = await new this.invitationModel({
      organizationId: dto.organizationId,
      email: normalizedEmail,
      invitedBy: invitedByUserId,
      token,
      status: InvitationStatus.PENDING,
      expiresAt,
    }).save();

    await this.auditService.record({
      action: AuditAction.ORGANIZATION_INVITATION_CREATED,
      context: audit!,
      target: { type: TARGET_TYPE, id: invitation.id },
      before: null,
      after: snapshot(invitation, INVITATION_AUDIT_FIELDS),
    });

    return invitation;
  }

  async accept(
    token: string,
    accepterUserId: string,
    audit?: AuditContext,
  ): Promise<OrganizationMember> {
    const invitation = await this.invitationModel.findOne({ token }).exec();

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new ConflictException('Invitation has already been used');
    }

    if (new Date() > invitation.expiresAt) {
      await this.invitationModel
        .findByIdAndUpdate(invitation.id, {
          status: InvitationStatus.EXPIRED,
        })
        .exec();
      throw new GoneException('Invitation has expired');
    }

    const existingMember = await this.memberModel
      .findOne({
        organizationId: invitation.organizationId,
        userId: accepterUserId,
      })
      .exec();

    if (existingMember) {
      throw new ConflictException(
        'You are already a member of this organization',
      );
    }

    invitation.status = InvitationStatus.ACCEPTED;
    invitation.acceptedAt = new Date();
    await invitation.save();

    const member = await new this.memberModel({
      organizationId: invitation.organizationId,
      userId: accepterUserId,
      role: OrganizationRole.MEMBER,
    }).save();

    await this.auditService.record({
      action: AuditAction.ORGANIZATION_INVITATION_ACCEPTED,
      context: audit!,
      target: { type: TARGET_TYPE, id: invitation.id },
      before: snapshot(invitation, INVITATION_AUDIT_FIELDS),
      after: snapshot(invitation, INVITATION_AUDIT_FIELDS),
    });

    return member;
  }

  async revoke(
    invitationId: string,
    revokerRole: OrganizationRole,
    audit?: AuditContext,
  ): Promise<{ id: string; revoked: boolean }> {
    if (
      revokerRole !== OrganizationRole.OWNER &&
      revokerRole !== OrganizationRole.ADMIN
    ) {
      throw new ConflictException(
        'Only owners or admins can revoke invitations',
      );
    }

    const invitation = await this.invitationModel.findById(invitationId).exec();

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new ConflictException('Only pending invitations can be revoked');
    }

    invitation.status = InvitationStatus.REVOKED;
    await invitation.save();

    await this.auditService.record({
      action: AuditAction.ORGANIZATION_INVITATION_REVOKED,
      context: audit!,
      target: { type: TARGET_TYPE, id: invitationId },
      before: snapshot(invitation, INVITATION_AUDIT_FIELDS),
      after: snapshot(invitation, INVITATION_AUDIT_FIELDS),
    });

    return { id: invitationId, revoked: true };
  }

  async findByOrganization(
    organizationId: string,
  ): Promise<OrganizationInvitation[]> {
    return this.invitationModel
      .find({ organizationId })
      .sort({ createdAt: -1 })
      .exec();
  }
}
