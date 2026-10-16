import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  EligibilityAttestation,
  EligibilityAttestationDocument,
  AttestationScope,
  AttestationStatus,
} from '../schemas/eligibility-attestation.schema';
import {
  ScholarshipProgram,
  ScholarshipProgramDocument,
} from '../schemas/scholarship-program.schema';
import { EligibilityAttestationService } from '../services/eligibility-attestation.service';
import { ErrorCode } from '../../common/errors/error-codes.enum';

describe('EligibilityAttestationService', () => {
  let service: EligibilityAttestationService;
  let attestationModel: jest.Mocked<Model<EligibilityAttestationDocument>>;
  let programModel: jest.Mocked<Model<ScholarshipProgramDocument>>;

  const programId = '507f1f77bcf86cd799439011';
  const attestationId = '507f1f77bcf86cd799439055';
  const orgId = 'org-1';
  const applicantId = 'student-1';
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const makeAttestation = (overrides: Record<string, unknown> = {}) => ({
    _id: attestationId,
    organizationId: orgId,
    programId,
    applicantId,
    issuer: 'enrollment-service',
    scope: AttestationScope.ENROLLMENT,
    version: '1.0',
    payload: { enrolled: true },
    status: AttestationStatus.ACTIVE,
    expiresAt: futureDate,
    issuedAt: new Date(),
    ...overrides,
  });

  const execResolved = (value: unknown) => ({ exec: jest.fn().mockResolvedValue(value) });
  const sortExec = (value: unknown) => ({
    sort: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EligibilityAttestationService,
        {
          provide: getModelToken(EligibilityAttestation.name),
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            find: jest.fn(),
            findOneAndUpdate: jest.fn(),
            countDocuments: jest.fn(),
            updateMany: jest.fn(),
          },
        },
        {
          provide: getModelToken(ScholarshipProgram.name),
          useValue: { findOne: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(EligibilityAttestationService);
    attestationModel = module.get(getModelToken(EligibilityAttestation.name));
    programModel = module.get(getModelToken(ScholarshipProgram.name));
  });

  describe('issueAttestation', () => {
    const dto = {
      organizationId: orgId,
      programId,
      applicantId,
      issuer: 'enrollment-service',
      scope: AttestationScope.ENROLLMENT,
      version: '1.0',
      payload: { enrolled: true },
      expiresAt: futureDate,
    };

    it('issues a new attestation successfully', async () => {
      const program = { _id: programId };
      const attestation = makeAttestation();
      (programModel.findOne as jest.Mock).mockReturnValue(execResolved(program));
      (attestationModel.create as jest.Mock).mockResolvedValue(attestation);

      const result = await service.issueAttestation(dto, 'admin-1');
      expect(result.scope).toBe(AttestationScope.ENROLLMENT);
      expect(result.status).toBe(AttestationStatus.ACTIVE);
    });

    it('throws BIZ_ATTESTATION_INVALID_EXPIRY when expiresAt is in the past', async () => {
      const program = { _id: programId };
      (programModel.findOne as jest.Mock).mockReturnValue(execResolved(program));

      await expect(
        service.issueAttestation(
          { ...dto, expiresAt: new Date(Date.now() - 1000) },
          'admin-1',
        ),
      ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_ATTESTATION_INVALID_EXPIRY });
    });

    it('throws NOT_FOUND when program does not exist', async () => {
      (programModel.findOne as jest.Mock).mockReturnValue(execResolved(null));

      await expect(service.issueAttestation(dto, 'admin-1')).rejects.toMatchObject({
        errorCode: ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND,
      });
    });
  });

  describe('revokeAttestation', () => {
    it('revokes an active attestation immediately', async () => {
      const attestation = makeAttestation();
      const revoked = { ...attestation, status: AttestationStatus.REVOKED };
      (attestationModel.findById as jest.Mock).mockReturnValue(execResolved(attestation));
      (attestationModel.findOneAndUpdate as jest.Mock).mockReturnValue(
        execResolved(revoked),
      );

      const result = await service.revokeAttestation(attestationId, 'admin-1', {
        reason: 'Student withdrew from program',
      });
      expect(result.status).toBe(AttestationStatus.REVOKED);
    });

    it('throws BIZ_ATTESTATION_ALREADY_REVOKED for already-revoked attestation', async () => {
      const attestation = makeAttestation({ status: AttestationStatus.REVOKED });
      (attestationModel.findById as jest.Mock).mockReturnValue(execResolved(attestation));

      await expect(
        service.revokeAttestation(attestationId, 'admin-1', {}),
      ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_ATTESTATION_ALREADY_REVOKED });
    });

    it('throws NOT_FOUND when attestation does not exist', async () => {
      (attestationModel.findById as jest.Mock).mockReturnValue(execResolved(null));

      await expect(
        service.revokeAttestation(attestationId, 'admin-1', {}),
      ).rejects.toMatchObject({ errorCode: ErrorCode.RES_ELIGIBILITY_ATTESTATION_NOT_FOUND });
    });
  });

  describe('getActiveAttestations', () => {
    it('returns only active non-expired attestations', async () => {
      const active = [makeAttestation()];
      (attestationModel.find as jest.Mock).mockReturnValue(sortExec(active));

      const result = await service.getActiveAttestations(programId, applicantId);
      expect(result).toHaveLength(1);
      // Verify the query filters on status=ACTIVE and future expiresAt
      const findCall = (attestationModel.find as jest.Mock).mock.calls[0][0];
      expect(findCall.status).toBe(AttestationStatus.ACTIVE);
      expect(findCall.expiresAt.$gt).toBeDefined();
    });
  });

  describe('validateAttestation', () => {
    it('returns the attestation when active and not expired', async () => {
      const attestation = makeAttestation();
      (attestationModel.findById as jest.Mock).mockReturnValue(execResolved(attestation));

      const result = await service.validateAttestation(attestationId);
      expect(result.status).toBe(AttestationStatus.ACTIVE);
    });

    it('throws BIZ_ATTESTATION_ALREADY_REVOKED for revoked attestation', async () => {
      const attestation = makeAttestation({ status: AttestationStatus.REVOKED });
      (attestationModel.findById as jest.Mock).mockReturnValue(execResolved(attestation));

      await expect(service.validateAttestation(attestationId)).rejects.toMatchObject({
        errorCode: ErrorCode.BIZ_ATTESTATION_ALREADY_REVOKED,
      });
    });

    it('throws BIZ_ATTESTATION_EXPIRED for expired attestation', async () => {
      const attestation = makeAttestation({
        status: AttestationStatus.EXPIRED,
        expiresAt: new Date(Date.now() - 1000),
      });
      (attestationModel.findById as jest.Mock).mockReturnValue(execResolved(attestation));

      await expect(service.validateAttestation(attestationId)).rejects.toMatchObject({
        errorCode: ErrorCode.BIZ_ATTESTATION_EXPIRED,
      });
    });

    it('throws BIZ_ATTESTATION_EXPIRED when expiresAt has passed (status still ACTIVE)', async () => {
      const attestation = makeAttestation({
        status: AttestationStatus.ACTIVE,
        expiresAt: new Date(Date.now() - 1000), // past
      });
      (attestationModel.findById as jest.Mock).mockReturnValue(execResolved(attestation));

      await expect(service.validateAttestation(attestationId)).rejects.toMatchObject({
        errorCode: ErrorCode.BIZ_ATTESTATION_EXPIRED,
      });
    });
  });

  describe('checkAttestation', () => {
    it('returns false when no valid attestation exists for scope', async () => {
      (attestationModel.countDocuments as jest.Mock).mockReturnValue(execResolved(0));

      const result = await service.checkAttestation(
        programId,
        applicantId,
        AttestationScope.INCOME,
      );
      expect(result).toBe(false);
    });

    it('returns true when valid attestation exists', async () => {
      (attestationModel.countDocuments as jest.Mock).mockReturnValue(execResolved(1));

      const result = await service.checkAttestation(
        programId,
        applicantId,
        AttestationScope.ENROLLMENT,
      );
      expect(result).toBe(true);
    });
  });
});
