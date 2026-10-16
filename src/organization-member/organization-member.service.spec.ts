import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { OrganizationMemberService } from './organization-member.service';
import { OrganizationMember } from './schemas/organization-member.schema';
import { OrganizationRole } from '../common/enums/organization-role.enum';
import { AuditService } from '../common/audit/audit.service';
import { AuditAction } from '../common/audit/audit-action.enum';
import { AuditContext } from '../common/audit/audit-context';

const audit: AuditContext = {
  actorId: 'u-owner',
  actorEmail: 'owner@org.test',
  actorRole: 'tutor',
  requestId: 'req-1',
  ip: '127.0.0.1',
  userAgent: 'jest',
};

const auditService = { record: jest.fn().mockResolvedValue(null) };

const memberDoc = (over: Record<string, unknown> = {}) => ({
  id: 'm-1',
  organizationId: 'org-a',
  userId: 'u-member',
  role: OrganizationRole.MEMBER,
  toObject() {
    const { toObject, ...rest } = this;
    return rest;
  },
  ...over,
});

const mockModel: any = jest.fn();
mockModel.findOne = jest.fn();
mockModel.find = jest.fn();
mockModel.findById = jest.fn();
mockModel.findByIdAndUpdate = jest.fn();
mockModel.findByIdAndDelete = jest.fn();
mockModel.countDocuments = jest.fn();

const exec = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

describe('OrganizationMemberService', () => {
  let service: OrganizationMemberService;

  beforeEach(async () => {
    jest.clearAllMocks();
    auditService.record.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationMemberService,
        {
          provide: getModelToken(OrganizationMember.name),
          useValue: mockModel,
        },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(OrganizationMemberService);
  });

  describe('findByUser', () => {
    it('lets a caller list their own memberships', async () => {
      mockModel.find.mockReturnValue(exec([memberDoc()]));

      await expect(service.findByUser('u-1', 'u-1')).resolves.toHaveLength(1);
      expect(mockModel.find).toHaveBeenCalledWith({ userId: 'u-1' });
    });

    it("refuses to enumerate another user's memberships", async () => {
      await expect(
        service.findByUser('u-victim', 'u-attacker'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockModel.find).not.toHaveBeenCalled();
    });

    it('allows a platform admin to list any user', async () => {
      mockModel.find.mockReturnValue(exec([]));

      await expect(
        service.findByUser('u-victim', 'platform-admin', true),
      ).resolves.toEqual([]);
    });
  });

  describe('updateRole', () => {
    it('records an audit entry with before and after roles', async () => {
      mockModel.findById.mockReturnValue(exec(memberDoc()));
      mockModel.findByIdAndUpdate.mockReturnValue(
        exec(memberDoc({ role: OrganizationRole.INSTRUCTOR })),
      );

      await service.updateRole(
        'm-1',
        { role: OrganizationRole.INSTRUCTOR },
        OrganizationRole.ADMIN,
        audit,
      );

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.ORGANIZATION_MEMBER_ROLE_CHANGED,
          context: audit,
          target: { type: 'organization_member', id: 'm-1' },
          before: expect.objectContaining({ role: OrganizationRole.MEMBER }),
          after: expect.objectContaining({ role: OrganizationRole.INSTRUCTOR }),
        }),
      );
    });

    it('refuses a missing role', async () => {
      mockModel.findById.mockReturnValue(exec(memberDoc()));

      await expect(
        service.updateRole('m-1', {}, OrganizationRole.OWNER, audit),
      ).rejects.toThrow(BadRequestException);
    });

    it('stops an org admin from granting ownership', async () => {
      mockModel.findById.mockReturnValue(exec(memberDoc()));

      await expect(
        service.updateRole(
          'm-1',
          { role: OrganizationRole.OWNER },
          OrganizationRole.ADMIN,
          audit,
        ),
      ).rejects.toThrow(/Only an organization owner can grant or revoke/);
      expect(mockModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('stops an org admin from demoting an owner', async () => {
      mockModel.findById.mockReturnValue(
        exec(memberDoc({ role: OrganizationRole.OWNER })),
      );

      await expect(
        service.updateRole(
          'm-1',
          { role: OrganizationRole.MEMBER },
          OrganizationRole.ADMIN,
          audit,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets an owner grant ownership to someone else', async () => {
      mockModel.findById.mockReturnValue(exec(memberDoc()));
      mockModel.findByIdAndUpdate.mockReturnValue(
        exec(memberDoc({ role: OrganizationRole.OWNER })),
      );

      await expect(
        service.updateRole(
          'm-1',
          { role: OrganizationRole.OWNER },
          OrganizationRole.OWNER,
          audit,
        ),
      ).resolves.toBeDefined();
    });

    it('refuses to demote the last remaining owner', async () => {
      mockModel.findById.mockReturnValue(
        exec(memberDoc({ role: OrganizationRole.OWNER })),
      );
      mockModel.countDocuments.mockReturnValue(exec(0));

      await expect(
        service.updateRole(
          'm-1',
          { role: OrganizationRole.ADMIN },
          OrganizationRole.OWNER,
          audit,
        ),
      ).rejects.toThrow(/at least one owner/);
    });

    it('allows demoting an owner when another owner remains', async () => {
      mockModel.findById.mockReturnValue(
        exec(memberDoc({ role: OrganizationRole.OWNER })),
      );
      mockModel.countDocuments.mockReturnValue(exec(1));
      mockModel.findByIdAndUpdate.mockReturnValue(
        exec(memberDoc({ role: OrganizationRole.ADMIN })),
      );

      await expect(
        service.updateRole(
          'm-1',
          { role: OrganizationRole.ADMIN },
          OrganizationRole.OWNER,
          audit,
        ),
      ).resolves.toBeDefined();
    });

    it('surfaces a missing membership as 404', async () => {
      mockModel.findById.mockReturnValue(exec(null));

      await expect(
        service.updateRole('nope', { role: OrganizationRole.MEMBER }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeMember', () => {
    it('audits the removal with the prior state', async () => {
      mockModel.findById.mockReturnValue(exec(memberDoc()));
      mockModel.findByIdAndDelete.mockReturnValue(exec(memberDoc()));

      await service.removeMember('m-1', OrganizationRole.ADMIN, audit);

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.ORGANIZATION_MEMBER_REMOVED,
          before: expect.objectContaining({ userId: 'u-member' }),
          after: null,
        }),
      );
    });

    it('stops an org admin from removing an owner', async () => {
      mockModel.findById.mockReturnValue(
        exec(memberDoc({ role: OrganizationRole.OWNER })),
      );

      await expect(
        service.removeMember('m-1', OrganizationRole.ADMIN, audit),
      ).rejects.toThrow(/Only an organization owner can remove another owner/);
      expect(mockModel.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it('refuses to remove the last owner', async () => {
      mockModel.findById.mockReturnValue(
        exec(memberDoc({ role: OrganizationRole.OWNER })),
      );
      mockModel.countDocuments.mockReturnValue(exec(0));

      await expect(
        service.removeMember('m-1', OrganizationRole.OWNER, audit),
      ).rejects.toThrow(/at least one owner/);
    });
  });

  describe('addMember', () => {
    it('rejects a duplicate membership', async () => {
      mockModel.findOne.mockReturnValue(exec(memberDoc()));

      await expect(
        service.addMember(
          {
            organizationId: 'org-a',
            userId: 'u-member',
            role: OrganizationRole.MEMBER,
          },
          audit,
        ),
      ).rejects.toThrow(/already a member/);
    });
  });
});
