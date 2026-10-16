import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  OfflineGrant,
  OfflineGrantDocument,
  OfflineGrantStatus,
} from '../schemas/offline-grant.schema';
import { DigitalLoan, DigitalLoanDocument, DigitalLoanStatus } from '../schemas/digital-loan.schema';
import { LibraryTransactionRunner } from '../mongo-transaction-runner';
import {
  OfflineGrantService,
  hashDeviceId,
} from '../services/offline-grant.service';
import {
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

describe('OfflineGrantService', () => {
  let service: OfflineGrantService;
  let offlineGrantModel: jest.Mocked<Model<OfflineGrantDocument>>;
  let digitalLoanModel: jest.Mocked<Model<DigitalLoanDocument>>;
  let transactionRunner: { run: jest.Mock };

  const earlier = new Date('2025-01-01T00:00:00.000Z');
  const later = new Date('2030-01-01T00:00:00.000Z');

  const makeGrant = (overrides: Record<string, unknown> = {}) => ({
    _id: '507f1f77bcf86cd799439021',
    patronId: 'patron-1',
    loanId: '507f1f77bcf86cd799439022',
    editionId: 'edition-1',
    renditionId: 'rendition-pdf',
    deviceIdHash: hashDeviceId('device-abc-123'),
    allowedDeviceCount: 1,
    expiresAt: later,
    status: OfflineGrantStatus.ACTIVE,
    grantToken: 'a'.repeat(64),
    createdAt: earlier,
    updatedAt: earlier,
    ...overrides,
  });

  const makeLoan = (overrides: Record<string, unknown> = {}) => ({
    _id: '507f1f77bcf86cd799439022',
    patronId: 'patron-1',
    editionId: 'edition-1',
    format: 'pdf',
    expiresAt: later,
    status: DigitalLoanStatus.ACTIVE,
    accessRevoked: false,
    ...overrides,
  });

  const chainQuery = (value: unknown) =>
    ({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(value),
    }) as never;

  beforeEach(async () => {
    offlineGrantModel = {
      findById: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      countDocuments: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(),
      updateMany: jest.fn(),
    } as unknown as jest.Mocked<Model<OfflineGrantDocument>>;

    digitalLoanModel = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<Model<DigitalLoanDocument>>;

    transactionRunner = {
      run: jest.fn(async (work) => work(null)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfflineGrantService,
        { provide: getModelToken(OfflineGrant.name), useValue: offlineGrantModel },
        { provide: getModelToken(DigitalLoan.name), useValue: digitalLoanModel },
        { provide: LibraryTransactionRunner, useValue: transactionRunner },
      ],
    }).compile();

    service = module.get<OfflineGrantService>(OfflineGrantService);
  });

  describe('createGrant', () => {
    const dto = {
      loanId: '507f1f77bcf86cd799439022',
      renditionId: 'rendition-pdf',
      deviceId: 'device-abc-123',
    };

    it('throws RES_LOAN_NOT_FOUND when the loan does not exist', async () => {
      digitalLoanModel.findById.mockReturnValue(chainQuery(null));

      await expect(service.createGrant('patron-1', dto as any)).rejects.toMatchObject({
        code: ErrorCode.RES_LOAN_NOT_FOUND,
      });
    });

    it('throws a forbidden error when the loan belongs to another patron', async () => {
      digitalLoanModel.findById.mockReturnValue(
        chainQuery(makeLoan({ patronId: 'patron-other' })),
      );

      await expect(service.createGrant('patron-1', dto as any)).rejects.toBeInstanceOf(
        ForbiddenDomainException,
      );
    });

    it('throws BIZ_LOAN_NOT_ACTIVE when the loan is not active', async () => {
      digitalLoanModel.findById.mockReturnValue(
        chainQuery(makeLoan({ status: DigitalLoanStatus.RETURNED })),
      );

      await expect(service.createGrant('patron-1', dto as any)).rejects.toMatchObject({
        code: ErrorCode.BIZ_LOAN_NOT_ACTIVE,
      });
    });

    it('throws BIZ_LOAN_NOT_ACTIVE when loan access has been revoked', async () => {
      digitalLoanModel.findById.mockReturnValue(
        chainQuery(makeLoan({ accessRevoked: true })),
      );

      await expect(service.createGrant('patron-1', dto as any)).rejects.toMatchObject({
        code: ErrorCode.BIZ_LOAN_NOT_ACTIVE,
      });
    });

    it('throws BIZ_LOAN_EXPIRED when the loan has expired', async () => {
      digitalLoanModel.findById.mockReturnValue(
        chainQuery(makeLoan({ expiresAt: earlier })),
      );

      await expect(service.createGrant('patron-1', dto as any)).rejects.toMatchObject({
        code: ErrorCode.BIZ_LOAN_EXPIRED,
      });
    });

    it('throws VAL_OUT_OF_RANGE when expiry exceeds the loan expiry', async () => {
      digitalLoanModel.findById.mockReturnValue(chainQuery(makeLoan()));

      await expect(
        service.createGrant('patron-1', { ...dto, expiresAt: '2060-01-01T00:00:00.000Z' } as any),
      ).rejects.toMatchObject({
        code: ErrorCode.VAL_OUT_OF_RANGE,
      });
    });

    it('throws VAL_OUT_OF_RANGE when expiry is in the past', async () => {
      digitalLoanModel.findById.mockReturnValue(chainQuery(makeLoan()));

      await expect(
        service.createGrant('patron-1', { ...dto, expiresAt: '2020-01-01T00:00:00.000Z' } as any),
      ).rejects.toMatchObject({
        code: ErrorCode.VAL_OUT_OF_RANGE,
      });
    });

    it('stores only the hashed device id and binds to the loan edition and loan expiry', async () => {
      digitalLoanModel.findById.mockReturnValue(chainQuery(makeLoan()));
      offlineGrantModel.findOne.mockReturnValue(chainQuery(null));
      offlineGrantModel.countDocuments.mockReturnValue(chainQuery(0));
      const grant = makeGrant();
      offlineGrantModel.create.mockResolvedValue([grant] as any);

      await service.createGrant('patron-1', dto as any);

      const created = offlineGrantModel.create.mock.calls[0][0][0];
      expect(created.deviceIdHash).toBe(hashDeviceId('device-abc-123'));
      expect(created.deviceIdHash).not.toBe('device-abc-123');
      expect(created.editionId).toBe('edition-1');
      expect(created.expiresAt).toBe(later);
      expect(created.status).toBe(OfflineGrantStatus.ACTIVE);
      expect(created.grantToken).toHaveLength(64);
      expect(created.deviceId).toBeUndefined();
    });

    it('returns the existing active grant for the same loan, rendition, and device without duplicating', async () => {
      digitalLoanModel.findById.mockReturnValue(chainQuery(makeLoan()));
      const existing = makeGrant();
      offlineGrantModel.findOne.mockReturnValue(chainQuery(existing));

      const result = await service.createGrant('patron-1', dto as any);

      expect(result).toEqual(existing);
      expect(offlineGrantModel.create).not.toHaveBeenCalled();
    });

    it('throws BIZ_OFFLINE_DEVICE_LIMIT when the active device count equals the limit', async () => {
      digitalLoanModel.findById.mockReturnValue(chainQuery(makeLoan()));
      offlineGrantModel.findOne.mockReturnValue(chainQuery(null));
      offlineGrantModel.countDocuments.mockReturnValue(chainQuery(1));

      await expect(
        service.createGrant('patron-1', { ...dto, allowedDeviceCount: 1 } as any),
      ).rejects.toMatchObject({
        code: ErrorCode.BIZ_OFFLINE_DEVICE_LIMIT,
      });
    });
  });

  describe('listGrants', () => {
    it('reconciles expired grants and returns the caller-owned grants', async () => {
      const expiring = makeGrant({ _id: '507f1f77bcf86cd799439031' });
      offlineGrantModel.updateMany.mockReturnValue(chainQuery({ modifiedCount: 1 }));
      const grants = [makeGrant(), expiring];
      offlineGrantModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(grants) as never }),
      } as never);

      const result = await service.listGrants('patron-1');

      const updateCriteria = offlineGrantModel.updateMany.mock.calls[0][0];
      expect(updateCriteria).toMatchObject({
        patronId: 'patron-1',
        status: OfflineGrantStatus.ACTIVE,
      });
      expect(updateCriteria.expiresAt).toHaveProperty('$lte');
      expect(result).toEqual(grants);
    });
  });

  describe('revokeGrant', () => {
    it('throws RES_OFFLINE_GRANT_NOT_FOUND when the grant does not exist', async () => {
      offlineGrantModel.findById.mockReturnValue(chainQuery(null));

      await expect(service.revokeGrant('507f1f77bcf86cd799439099', 'patron-1')).rejects.toMatchObject({
        code: ErrorCode.RES_OFFLINE_GRANT_NOT_FOUND,
      });
    });

    it('throws a forbidden error when the grant belongs to another patron', async () => {
      offlineGrantModel.findById.mockReturnValue(chainQuery(makeGrant({ patronId: 'patron-other' })));

      await expect(service.revokeGrant('507f1f77bcf86cd799439021', 'patron-1')).rejects.toBeInstanceOf(
        ForbiddenDomainException,
      );
    });

    it('throws BIZ_OFFLINE_GRANT_INACTIVE when the grant is not active', async () => {
      offlineGrantModel.findById.mockReturnValue(
        chainQuery(makeGrant({ status: OfflineGrantStatus.REVOKED })),
      );

      await expect(service.revokeGrant('507f1f77bcf86cd799439021', 'patron-1')).rejects.toMatchObject({
        code: ErrorCode.BIZ_OFFLINE_GRANT_INACTIVE,
      });
    });

    it('revokes the active grant', async () => {
      const revoked = makeGrant({ status: OfflineGrantStatus.REVOKED });
      offlineGrantModel.findById.mockReturnValue(chainQuery(makeGrant()));
      offlineGrantModel.findOneAndUpdate.mockReturnValue(chainQuery(revoked));

      const result = await service.revokeGrant('507f1f77bcf86cd799439021', 'patron-1');

      expect(offlineGrantModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: '507f1f77bcf86cd799439021', status: OfflineGrantStatus.ACTIVE },
        expect.objectContaining({ $set: { status: OfflineGrantStatus.REVOKED } }),
        { new: true },
      );
      expect(result.status).toBe(OfflineGrantStatus.REVOKED);
    });
  });

  describe('authorizeDownload', () => {
    it('denies when the grant token is unknown', async () => {
      offlineGrantModel.findOne.mockReturnValue(chainQuery(null));

      await expect(
        service.authorizeDownload('patron-1', 'unknown-token', 'device-abc-123'),
      ).rejects.toMatchObject({
        code: ErrorCode.BIZ_OFFLINE_DOWNLOAD_DENIED,
      });
    });

    it('denies when the grant is not active', async () => {
      offlineGrantModel.findOne.mockReturnValue(
        chainQuery(makeGrant({ status: OfflineGrantStatus.REVOKED })),
      );

      await expect(
        service.authorizeDownload('patron-1', 'token', 'device-abc-123'),
      ).rejects.toMatchObject({
        code: ErrorCode.BIZ_OFFLINE_DOWNLOAD_DENIED,
      });
    });

    it('denies when the grant belongs to another patron', async () => {
      offlineGrantModel.findOne.mockReturnValue(chainQuery(makeGrant({ patronId: 'patron-other' })));

      await expect(
        service.authorizeDownload('patron-1', 'token', 'device-abc-123'),
      ).rejects.toMatchObject({
        code: ErrorCode.BIZ_OFFLINE_DOWNLOAD_DENIED,
      });
    });

    it('denies when the device id does not match the stored hash', async () => {
      offlineGrantModel.findOne.mockReturnValue(chainQuery(makeGrant()));

      await expect(
        service.authorizeDownload('patron-1', 'token', 'a-completely-different-device'),
      ).rejects.toMatchObject({
        code: ErrorCode.BIZ_OFFLINE_DOWNLOAD_DENIED,
      });
    });

    it('denies and marks the grant expired when the grant expiry passed', async () => {
      offlineGrantModel.findOne.mockReturnValue(
        chainQuery(makeGrant({ expiresAt: earlier })),
      );
      offlineGrantModel.updateOne.mockReturnValue(chainQuery({ modifiedCount: 1 }));

      await expect(
        service.authorizeDownload('patron-1', 'token', 'device-abc-123'),
      ).rejects.toMatchObject({
        code: ErrorCode.BIZ_OFFLINE_DOWNLOAD_DENIED,
      });

      expect(offlineGrantModel.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ status: OfflineGrantStatus.ACTIVE }),
        expect.objectContaining({ $set: { status: OfflineGrantStatus.EXPIRED } }),
      );
    });

    it('denies when the loan is missing', async () => {
      offlineGrantModel.findOne.mockReturnValue(chainQuery(makeGrant()));
      digitalLoanModel.findById.mockReturnValue(chainQuery(null));

      await expect(
        service.authorizeDownload('patron-1', 'token', 'device-abc-123'),
      ).rejects.toMatchObject({
        code: ErrorCode.BIZ_OFFLINE_DOWNLOAD_DENIED,
      });
    });

    it('denies when the loan is no longer active', async () => {
      offlineGrantModel.findOne.mockReturnValue(chainQuery(makeGrant()));
      digitalLoanModel.findById.mockReturnValue(
        chainQuery(makeLoan({ status: DigitalLoanStatus.RETURNED })),
      );

      await expect(
        service.authorizeDownload('patron-1', 'token', 'device-abc-123'),
      ).rejects.toMatchObject({
        code: ErrorCode.BIZ_OFFLINE_DOWNLOAD_DENIED,
      });
    });

    it('denies when the loan access has been revoked', async () => {
      offlineGrantModel.findOne.mockReturnValue(chainQuery(makeGrant()));
      digitalLoanModel.findById.mockReturnValue(
        chainQuery(makeLoan({ accessRevoked: true })),
      );

      await expect(
        service.authorizeDownload('patron-1', 'token', 'device-abc-123'),
      ).rejects.toMatchObject({
        code: ErrorCode.BIZ_OFFLINE_DOWNLOAD_DENIED,
      });
    });

    it('denies when the loan has expired', async () => {
      offlineGrantModel.findOne.mockReturnValue(chainQuery(makeGrant()));
      digitalLoanModel.findById.mockReturnValue(
        chainQuery(makeLoan({ expiresAt: earlier })),
      );

      await expect(
        service.authorizeDownload('patron-1', 'token', 'device-abc-123'),
      ).rejects.toMatchObject({
        code: ErrorCode.BIZ_OFFLINE_DOWNLOAD_DENIED,
      });
    });

    it('authorizes a valid grant for the owning patron and matching device', async () => {
      offlineGrantModel.findOne.mockReturnValue(chainQuery(makeGrant()));
      digitalLoanModel.findById.mockReturnValue(chainQuery(makeLoan()));

      const result = await service.authorizeDownload(
        'patron-1',
        'a'.repeat(64),
        'device-abc-123',
      );

      expect(result).toMatchObject({
        valid: true,
        patronId: 'patron-1',
        editionId: 'edition-1',
        renditionId: 'rendition-pdf',
      });
      expect(result.expiresAt).toEqual(later);
    });
  });

  describe('hashDeviceId', () => {
    it('returns a stable 64-character SHA-256 hex digest and reject raw device ids', () => {
      const hash = hashDeviceId('device-abc-123');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).not.toContain('device-abc-123');
      expect(hash).toBe(hashDeviceId('device-abc-123'));
    });
  });
});