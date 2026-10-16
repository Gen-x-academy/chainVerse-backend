import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ELibraryAuditLog,
  AuditAction,
  AuditLogDocument,
} from '../schemas/audit-log.schema';
import { PaginationService } from '../../common/pagination/pagination.service';
import {
  DigitalAccessAuditService,
  DigitalAccessOutcome,
} from '../services/digital-access-audit.service';
import {
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

describe('DigitalAccessAuditService', () => {
  let service: DigitalAccessAuditService;
  let auditModel: jest.Mocked<Model<AuditLogDocument>>;
  let paginationService: jest.Mocked<PaginationService>;

  const context = {
    patronId: 'patron-1',
    loanId: '507f1f77bcf86cd799439011',
    editionId: 'edition-1',
    renditionId: 'rendition-epub',
    requestId: 'req-1',
  };

  const chainExec = (value: unknown) => ({
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(value) as never }),
      }) as never,
    }) as never,
  });

  beforeEach(async () => {
    auditModel = {
      create: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
    } as unknown as jest.Mocked<Model<AuditLogDocument>>;

    paginationService = {
      paginate: jest.fn(),
    } as unknown as jest.Mocked<PaginationService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigitalAccessAuditService,
        { provide: getModelToken(ELibraryAuditLog.name), useValue: auditModel },
        { provide: PaginationService, useValue: paginationService },
      ],
    }).compile();

    service = module.get<DigitalAccessAuditService>(DigitalAccessAuditService);
  });

  describe('recordCheckout', () => {
    it('records a checkout event bound to the loan', async () => {
      auditModel.create.mockResolvedValue({ _id: 'audit-1' } as never);

      await service.recordCheckout(context);

      const created = auditModel.create.mock.calls[0][0];
      expect(created.action).toBe(AuditAction.DIGITAL_ACCESS_CHECKOUT);
      expect(created.actorId).toBe('patron-1');
      expect(created.targetType).toBe('digital_loan');
      expect(created.targetId).toBe(context.loanId);
      expect(created.metadata).toMatchObject({
        loanId: context.loanId,
        editionId: 'edition-1',
        renditionId: 'rendition-epub',
      });
    });
  });

  describe('recordReturn', () => {
    it('records a return event bound to the loan', async () => {
      auditModel.create.mockResolvedValue({ _id: 'audit-2' } as never);

      await service.recordReturn(context);

      const created = auditModel.create.mock.calls[0][0];
      expect(created.action).toBe(AuditAction.DIGITAL_ACCESS_RETURN);
      expect(created.targetType).toBe('digital_loan');
    });
  });

  describe('recordRevoke', () => {
    it('records a revocation event with a reason', async () => {
      auditModel.create.mockResolvedValue({ _id: 'audit-3' } as never);

      await service.recordRevoke(context, 'policy violation');

      const created = auditModel.create.mock.calls[0][0];
      expect(created.action).toBe(AuditAction.DIGITAL_ACCESS_REVOKE);
      expect(created.targetType).toBe('digital_loan');
      expect(created.reason).toBe('policy violation');
    });
  });

  describe('recordGrant', () => {
    it('records a fulfillment grant bound to the rendition', async () => {
      auditModel.create.mockResolvedValue({ _id: 'audit-4' } as never);

      await service.recordGrant(context);

      const created = auditModel.create.mock.calls[0][0];
      expect(created.action).toBe(AuditAction.DIGITAL_ACCESS_GRANT);
      expect(created.targetType).toBe('digital_rendition');
      expect(created.targetId).toBe('rendition-epub');
    });
  });

  describe('recordDenial', () => {
    it('records a denial event with a reason', async () => {
      auditModel.create.mockResolvedValue({ _id: 'audit-5' } as never);

      await service.recordDenial(context, 'loan access revoked');

      const created = auditModel.create.mock.calls[0][0];
      expect(created.action).toBe(AuditAction.DIGITAL_ACCESS_DENIED);
      expect(created.targetType).toBe('digital_rendition');
      expect(created.reason).toBe('loan access revoked');
    });
  });

  describe('metadata privacy', () => {
    it('keeps only coarse technical keys and drops page-level reading data', async () => {
      auditModel.create.mockResolvedValue({ _id: 'audit-6' } as never);

      await service.recordGrant({
        ...context,
        technical: {
          ipClass: 'dc',
          networkType: 'wifi',
          clientPlatform: 'ios',
          userAgentCategory: 'mobile',
          deviceClass: 'phone',
          referrerCategory: 'lms',
          pageNumber: 42,
          readingPosition: '04:31:12',
          timeSpentPerPage: 12,
          scrollDepth: 0.7,
        },
      });

      const metadata = auditModel.create.mock.calls[0][0].metadata;
      expect(metadata).toMatchObject({
        ipClass: 'dc',
        networkType: 'wifi',
        clientPlatform: 'ios',
        userAgentCategory: 'mobile',
        deviceClass: 'phone',
        referrerCategory: 'lms',
      });
      expect(metadata.pageNumber).toBeUndefined();
      expect(metadata.readingPosition).toBeUndefined();
      expect(metadata.timeSpentPerPage).toBeUndefined();
      expect(metadata.scrollDepth).toBeUndefined();
    });

    it('stores non-string coarse values as strings', async () => {
      auditModel.create.mockResolvedValue({ _id: 'audit-7' } as never);

      await service.recordGrant({ ...context, technical: { networkType: 0 } });

      expect(auditModel.create.mock.calls[0][0].metadata.networkType).toBe('0');
    });
  });

  describe('queryDigitalAccess', () => {
    it('filters by patron identifier, loan, edition, and rendition', async () => {
      const entries = [{ _id: 'audit-8' }];
      auditModel.find.mockReturnValue(
        chainExec(entries).find() as never,
      ) as never;

      await service.queryDigitalAccess({
        patronId: 'patron-1',
        loanId: context.loanId,
        editionId: 'edition-1',
        renditionId: 'rendition-epub',
      });

      const filter = (auditModel.find as jest.Mock).mock.calls[0][0];
      expect(filter).toMatchObject({
        actorId: 'patron-1',
        'metadata.loanId': context.loanId,
        'metadata.editionId': 'edition-1',
        'metadata.renditionId': 'rendition-epub',
      });
    });

    it('maps outcome granted to the grant action', async () => {
      auditModel.find.mockReturnValue(chainExec([]).find() as never) as never;

      await service.queryDigitalAccess({ outcome: DigitalAccessOutcome.GRANTED });

      expect((auditModel.find as jest.Mock).mock.calls[0][0]).toMatchObject({
        action: AuditAction.DIGITAL_ACCESS_GRANT,
      });
    });

    it('maps outcome denied to the denial action', async () => {
      auditModel.find.mockReturnValue(chainExec([]).find() as never) as never;

      await service.queryDigitalAccess({ outcome: DigitalAccessOutcome.DENIED });

      expect((auditModel.find as jest.Mock).mock.calls[0][0]).toMatchObject({
        action: AuditAction.DIGITAL_ACCESS_DENIED,
      });
    });

    it('rejects an unsupported outcome with VAL_INVALID_INPUT', async () => {
      await expect(
        service.queryDigitalAccess({ outcome: 'unknown' as DigitalAccessOutcome }),
      ).rejects.toMatchObject({
        code: ErrorCode.VAL_INVALID_INPUT,
      });
    });

    it('builds a timestamp range when date filters are present', async () => {
      auditModel.find.mockReturnValue(chainExec([]).find() as never) as never;

      await service.queryDigitalAccess({
        dateFrom: '2026-01-01T00:00:00.000Z',
        dateTo: '2026-01-31T23:59:59.000Z',
      });

      const filter = (auditModel.find as jest.Mock).mock.calls[0][0];
      expect(filter.timestamp).toMatchObject({
        $gte: new Date('2026-01-01T00:00:00.000Z'),
        $lte: new Date('2026-01-31T23:59:59.000Z'),
      });
    });

    it('delegates to the pagination service when pagination is provided', async () => {
      paginationService.paginate.mockResolvedValue({ data: [], total: 0 } as never);

      const result = await service.queryDigitalAccess(
        { patronId: 'patron-1' },
        { page: 2, limit: 25 },
      );

      expect(paginationService.paginate).toHaveBeenCalledWith(
        auditModel,
        { page: 2, limit: 25 },
        { actorId: 'patron-1' },
      );
      expect(result).toEqual({ data: [], total: 0 });
    });
  });

  describe('getAuditEntry', () => {
    it('returns the entry when found', async () => {
      const entry = { _id: 'audit-9' };
      auditModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(entry),
      } as never);

      const result = await service.getAuditEntry('audit-9');

      expect(result).toEqual(entry);
    });

    it('throws RES_AUDIT_LOG_NOT_FOUND when missing', async () => {
      auditModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      } as never);

      await expect(service.getAuditEntry('audit-9')).rejects.toMatchObject({
        code: ErrorCode.RES_AUDIT_LOG_NOT_FOUND,
      });
    });
  });
});