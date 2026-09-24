import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  GoneException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { OrganizationInvitationService } from './organization-invitation.service';
import {
  OrganizationInvitation,
  InvitationStatus,
} from './schemas/organization-invitation.schema';
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

const invitationDoc = (over: Record<string, unknown> = {}) => {
  const doc: Record<string, unknown> = {
    id: 'inv-1',
    organizationId: 'org-a',
    email: 'invitee@test.com',
    invitedBy: 'u-owner',
    token: 'abc123token',
    status: InvitationStatus.PENDING,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    acceptedAt: null,
    save: jest.fn().mockResolvedValue(true),
    toObject() {
      const { toObject, save, ...rest } = this;
      return rest;
    },
    ...over,
  };
  return doc;
};

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

const mockInvitationModel: any = jest.fn();
mockInvitationModel.findOne = jest.fn();
mockInvitationModel.find = jest.fn();
mockInvitationModel.findById = jest.fn();
mockInvitationModel.findByIdAndUpdate = jest.fn();

const mockMemberModel: any = jest.fn();
mockMemberModel.findOne = jest.fn();

const exec = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

describe('OrganizationInvitationService', () => {
  let service: OrganizationInvitationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    auditService.record.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationInvitationService,
        {
          provide: getModelToken(OrganizationInvitation.name),
          useValue: mockInvitationModel,
        },
        {
          provide: getModelToken(OrganizationMember.name),
          useValue: mockMemberModel,
        },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(OrganizationInvitationService);
  });

  describe('create', () => {
    it('creates an invitation with normalized email', async () => {
      mockInvitationModel.findOne.mockReturnValue(exec(null));
      const doc = invitationDoc({ save: jest.fn() });
      doc.save.mockResolvedValue(doc);
      mockInvitationModel.mockImplementation(() => doc);

      const result = await service.create(
        { organizationId: 'org-a', email: 'Invitee@Test.COM' },
        'u-owner',
        audit,
      );

      expect(doc.save).toHaveBeenCalled();
      expect(result.email).toBe('invitee@test.com');
    });

    it('rejects duplicate pending invitation for same email and org', async () => {
      mockInvitationModel.findOne.mockReturnValue(exec(invitationDoc()));

      await expect(
        service.create(
          { organizationId: 'org-a', email: 'invitee@test.com' },
          'u-owner',
          audit,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('records audit on creation', async () => {
      mockInvitationModel.findOne.mockReturnValue(exec(null));
      const doc = invitationDoc({ save: jest.fn() });
      doc.save.mockResolvedValue(doc);
      mockInvitationModel.mockImplementation(() => doc);

      await service.create(
        { organizationId: 'org-a', email: 'invitee@test.com' },
        'u-owner',
        audit,
      );

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.ORGANIZATION_INVITATION_CREATED,
          context: audit,
          target: { type: 'organization_invitation', id: 'inv-1' },
          before: null,
        }),
      );
    });
  });

  describe('accept', () => {
    it('accepts a valid pending invitation and creates membership', async () => {
      const doc = invitationDoc({ save: jest.fn() });
      doc.save.mockResolvedValue(doc);
      mockInvitationModel.findOne.mockReturnValue(exec(doc));
      mockMemberModel.findOne.mockReturnValue(exec(null));
      const memberDocInstance = memberDoc({
        userId: 'u-accepter',
        save: jest.fn(),
      });
      memberDocInstance.save.mockResolvedValue(memberDocInstance);
      mockMemberModel.mockImplementation(() => memberDocInstance);

      const result = await service.accept('abc123token', 'u-accepter', audit);

      expect(doc.status).toBe(InvitationStatus.ACCEPTED);
      expect(doc.save).toHaveBeenCalled();
      expect(result.userId).toBe('u-accepter');
    });

    it('rejects acceptance of non-existent token', async () => {
      mockInvitationModel.findOne.mockReturnValue(exec(null));

      await expect(service.accept('nonexistent', 'u-1', audit)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects acceptance of already accepted invitation', async () => {
      mockInvitationModel.findOne.mockReturnValue(
        exec(invitationDoc({ status: InvitationStatus.ACCEPTED })),
      );

      await expect(service.accept('abc123token', 'u-1', audit)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects acceptance of expired invitation', async () => {
      mockInvitationModel.findOne.mockReturnValue(
        exec(
          invitationDoc({
            expiresAt: new Date(Date.now() - 1000),
            save: jest.fn(),
          }),
        ),
      );
      mockInvitationModel.findByIdAndUpdate.mockReturnValue(exec({}));

      await expect(service.accept('abc123token', 'u-1', audit)).rejects.toThrow(
        GoneException,
      );
    });

    it('rejects acceptance when user is already a member', async () => {
      mockInvitationModel.findOne.mockReturnValue(exec(invitationDoc()));
      mockMemberModel.findOne.mockReturnValue(exec(memberDoc()));

      await expect(
        service.accept('abc123token', 'u-member', audit),
      ).rejects.toThrow(/already a member/);
    });
  });

  describe('revoke', () => {
    it('revokes a pending invitation', async () => {
      const doc = invitationDoc({ save: jest.fn() });
      doc.save.mockResolvedValue(doc);
      mockInvitationModel.findById.mockReturnValue(exec(doc));

      const result = await service.revoke(
        'inv-1',
        OrganizationRole.ADMIN,
        audit,
      );

      expect(doc.status).toBe(InvitationStatus.REVOKED);
      expect(result.revoked).toBe(true);
    });

    it('rejects revocation by non-admin/non-owner', async () => {
      await expect(
        service.revoke('inv-1', OrganizationRole.MEMBER, audit),
      ).rejects.toThrow(/Only owners or admins/);
    });

    it('rejects revocation of non-existent invitation', async () => {
      mockInvitationModel.findById.mockReturnValue(exec(null));

      await expect(
        service.revoke('inv-1', OrganizationRole.ADMIN, audit),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects revocation of already accepted invitation', async () => {
      mockInvitationModel.findById.mockReturnValue(
        exec(invitationDoc({ status: InvitationStatus.ACCEPTED })),
      );

      await expect(
        service.revoke('inv-1', OrganizationRole.ADMIN, audit),
      ).rejects.toThrow(/Only pending/);
    });
  });

  describe('findByOrganization', () => {
    it('returns invitations sorted by newest first', async () => {
      mockInvitationModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([invitationDoc()]),
        }),
      });

      const result = await service.findByOrganization('org-a');

      expect(result).toHaveLength(1);
    });
  });
});
