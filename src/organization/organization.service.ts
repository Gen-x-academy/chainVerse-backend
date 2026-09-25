import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import {
  Organization,
  OrganizationDocument,
} from './schemas/organization.schema';
import {
  OrganizationMember,
  OrganizationMemberDocument,
} from '../organization-member/schemas/organization-member.schema';
import { OrganizationRole } from '../common/enums/organization-role.enum';
import { AuditService } from '../common/audit/audit.service';
import { AuditAction } from '../common/audit/audit-action.enum';
import {
  AuditContext,
  systemAuditContext,
} from '../common/audit/audit-context';
import { snapshot } from '../common/audit/audit-redaction';

const TARGET_TYPE = 'organization';
const ORG_AUDIT_FIELDS = [
  'name',
  'description',
  'website',
  'logoUrl',
  'metadata',
] as const;

@Injectable()
export class OrganizationService {
  constructor(
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<OrganizationDocument>,
    @InjectModel(OrganizationMember.name)
    private readonly memberModel: Model<OrganizationMemberDocument>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Creates an organization and seeds its first membership.
   *
   * The creator becomes `owner` so the organization is never left without an
   * administrator and subsequent org-scoped checks have a principal to match.
   */
  async create(
    payload: CreateOrganizationDto,
    creatorUserId?: string,
    audit?: AuditContext,
  ): Promise<Organization> {
    const organization = await new this.organizationModel(payload).save();

    const ownerId = creatorUserId ?? audit?.actorId;
    if (ownerId && ownerId !== 'anonymous') {
      await new this.memberModel({
        organizationId: organization.id,
        userId: ownerId,
        role: OrganizationRole.OWNER,
      }).save();
    }

    await this.auditService.record({
      action: AuditAction.ORGANIZATION_CREATED,
      context: audit ?? systemAuditContext(),
      target: { type: TARGET_TYPE, id: organization.id },
      before: null,
      after: snapshot(organization, ORG_AUDIT_FIELDS),
    });

    return organization;
  }

  async findAll(): Promise<Organization[]> {
    return this.organizationModel.find().exec();
  }

  async findOne(id: string): Promise<OrganizationDocument> {
    const org = await this.organizationModel.findById(id).exec();
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  async update(
    id: string,
    payload: UpdateOrganizationDto,
    audit?: AuditContext,
  ): Promise<Organization> {
    const existing = await this.findOne(id);
    const before = snapshot(existing, ORG_AUDIT_FIELDS);

    const org = await this.organizationModel
      .findByIdAndUpdate(id, payload, { new: true })
      .exec();
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    await this.auditService.record({
      action: AuditAction.ORGANIZATION_UPDATED,
      context: audit ?? systemAuditContext(),
      target: { type: TARGET_TYPE, id },
      before,
      after: snapshot(org, ORG_AUDIT_FIELDS),
    });

    return org;
  }

  async remove(
    id: string,
    audit?: AuditContext,
  ): Promise<{ id: string; deleted: boolean }> {
    const result = await this.organizationModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Organization not found');
    }

    // Memberships are meaningless once the organization is gone, and leaving
    // them behind would let a recreated id inherit stale grants.
    await this.memberModel.deleteMany({ organizationId: id }).exec();

    await this.auditService.record({
      action: AuditAction.ORGANIZATION_DELETED,
      context: audit ?? systemAuditContext(),
      target: { type: TARGET_TYPE, id },
      before: snapshot(result, ORG_AUDIT_FIELDS),
      after: null,
    });

    return { id, deleted: true };
  }
}
