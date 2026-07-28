import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AuditService } from '../common/audit/audit.service';
import { AuditAction } from '../common/audit/audit-action.enum';
import { AuditContext } from '../common/audit/audit-context';
import { REDACTED } from '../common/audit/audit-redaction';

const audit: AuditContext = {
  actorId: 'admin-1',
  actorEmail: 'admin@chainverse.io',
  actorRole: 'admin',
  requestId: 'req-77',
  ip: '10.0.0.1',
  userAgent: 'jest',
};

const auditService = { record: jest.fn().mockResolvedValue(null) };
const entryFor = (action: AuditAction) =>
  auditService.record.mock.calls
    .map(([entry]) => entry)
    .find((entry) => entry.action === action);

describe('AdminAuthService', () => {
  let service: AdminAuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(AdminAuthService);
  });

  describe('business logic', () => {
    it('should create an admin', async () => {
      const adminData = { name: 'test admin', password: 'password' };
      const createdAdmin = await service.create(adminData, audit);
      expect(createdAdmin).toHaveProperty('id');
      expect(createdAdmin.name).toBe(adminData.name);
    });

    it('should find all admins', async () => {
      const adminData1 = { name: 'admin1', password: 'password' };
      const adminData2 = { name: 'admin2', password: 'password' };
      await service.create(adminData1, audit);
      await service.create(adminData2, audit);

      const allAdmins = service.findAll();
      expect(allAdmins.length).toBe(2);
    });

    it('should find one admin', async () => {
      const adminData = { name: 'test admin', password: 'password' };
      const createdAdmin = await service.create(adminData, audit);
      const foundAdmin = service.findOne(createdAdmin.id);
      expect(foundAdmin.id).toBe(createdAdmin.id);
    });

    it('should throw not found for findOne', () => {
      expect(() => service.findOne('non-existent-id')).toThrow(
        NotFoundException,
      );
    });

    it('should update an admin', async () => {
      const adminData = { name: 'test admin', password: 'password' };
      const createdAdmin = await service.create(adminData, audit);
      const updatedData = { name: 'updated admin' };
      const updatedAdmin = await service.update(
        createdAdmin.id,
        updatedData,
        audit,
      );
      expect(updatedAdmin.name).toBe(updatedData.name);
    });

    it('should throw not found for update', async () => {
      await expect(
        service.update('non-existent-id', { name: 'test' }, audit),
      ).rejects.toThrow(NotFoundException);
    });

    it('should remove an admin', async () => {
      const adminData = { name: 'test admin', password: 'password' };
      const createdAdmin = await service.create(adminData, audit);
      await service.remove(createdAdmin.id, audit);
      expect(() => service.findOne(createdAdmin.id)).toThrow(NotFoundException);
    });

    it('should throw not found for remove', async () => {
      await expect(service.remove('non-existent-id', audit)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('account administration auditing', () => {
    it('audits account creation with the actor and request ID', async () => {
      const created: any = await service.create(
        { name: 'ops' } as never,
        audit,
      );

      const entry = entryFor(AuditAction.ADMIN_ACCOUNT_CREATED);
      expect(entry).toBeDefined();
      expect(entry.context).toBe(audit);
      expect(entry.target).toEqual({
        type: 'admin_account',
        id: created.id,
      });
      expect(entry.before).toBeNull();
      expect(entry.after).toEqual(expect.objectContaining({ name: 'ops' }));
    });

    it('audits an update with both before and after state', async () => {
      const created: any = await service.create(
        { name: 'ops', tier: 'one' } as never,
        audit,
      );
      auditService.record.mockClear();

      await service.update(created.id, { tier: 'two' } as never, audit);

      const entry = entryFor(AuditAction.ADMIN_ACCOUNT_UPDATED);
      expect(entry.before).toEqual(expect.objectContaining({ tier: 'one' }));
      expect(entry.after).toEqual(expect.objectContaining({ tier: 'two' }));
    });

    it('redacts credentials in the audited snapshots', async () => {
      const created: any = await service.create(
        { name: 'ops', password: 'super-secret' } as never,
        audit,
      );

      const entry = entryFor(AuditAction.ADMIN_ACCOUNT_CREATED);
      expect(entry.after.password).toBe(REDACTED);
      expect(JSON.stringify(entry)).not.toContain('super-secret');
      expect(created.password).toBe('super-secret');
    });

    it('audits deletion with the prior state and a null after', async () => {
      const created: any = await service.create(
        { name: 'ops' } as never,
        audit,
      );
      auditService.record.mockClear();

      await service.remove(created.id, audit);

      const entry = entryFor(AuditAction.ADMIN_ACCOUNT_DELETED);
      expect(entry.before).toEqual(expect.objectContaining({ name: 'ops' }));
      expect(entry.after).toBeNull();
    });

    it('does not audit a deletion that never happened', async () => {
      await expect(service.remove('missing', audit)).rejects.toThrow(
        NotFoundException,
      );

      expect(entryFor(AuditAction.ADMIN_ACCOUNT_DELETED)).toBeUndefined();
    });

    it('falls back to a system actor when no HTTP context is supplied', async () => {
      await service.create({ name: 'seeded' } as never);

      const entry = entryFor(AuditAction.ADMIN_ACCOUNT_CREATED);
      expect(entry.context.actorId).toBe('system');
    });
  });
});
