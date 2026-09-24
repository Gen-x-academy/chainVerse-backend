import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ScholarshipApplication,
  ScholarshipApplicationDocument,
  ScholarshipApplicationStatus,
} from '../schemas/scholarship-application.schema';
import {
  ScholarshipProgram,
  ScholarshipProgramDocument,
} from '../schemas/scholarship-program.schema';
import {
  WithdrawalPolicy,
  WithdrawalPolicyDocument,
} from '../schemas/withdrawal-policy.schema';
import { WithdrawalPolicyService } from '../services/withdrawal-policy.service';
import {
  WithdrawalReasonCategory,
} from '../dto/withdrawal.dto';
import { ErrorCode } from '../../common/errors/error-codes.enum';

describe('WithdrawalPolicyService', () => {
  let service: WithdrawalPolicyService;
  let applicationModel: jest.Mocked<Model<ScholarshipApplicationDocument>>;
  let programModel: jest.Mocked<Model<ScholarshipProgramDocument>>;
  let policyModel: jest.Mocked<Model<WithdrawalPolicyDocument>>;

  const programId = '507f1f77bcf86cd799439011';
  const applicationId = '507f1f77bcf86cd799439031';
  const applicantId = 'student-abc';

  const makeApplication = (overrides: Record<string, unknown> = {}) => ({
    _id: applicationId,
    organizationId: 'org-1',
    programId,
    applicantId,
    status: ScholarshipApplicationStatus.SUBMITTED,
    createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
    ...overrides,
  });

  const confirmDto = {
    confirmWithdrawal: true as true,
    withdrawalReasonCategory: WithdrawalReasonCategory.PERSONAL,
    withdrawalReason: 'Accepted a local scholarship instead',
  };

  const execResolved = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });

  const findByIdChain = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawalPolicyService,
        {
          provide: getModelToken(ScholarshipApplication.name),
          useValue: {
            findById: jest.fn(),
            findOneAndUpdate: jest.fn(),
          },
        },
        {
          provide: getModelToken(ScholarshipProgram.name),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getModelToken(WithdrawalPolicy.name),
          useValue: {
            findOne: jest.fn(),
            findOneAndUpdate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(WithdrawalPolicyService);
    applicationModel = module.get(getModelToken(ScholarshipApplication.name));
    programModel = module.get(getModelToken(ScholarshipProgram.name));
    policyModel = module.get(getModelToken(WithdrawalPolicy.name));
  });

  describe('withdraw', () => {
    it('withdraws a SUBMITTED application successfully', async () => {
      const app = makeApplication();
      const withdrawn = { ...app, status: ScholarshipApplicationStatus.WITHDRAWN };
      (applicationModel.findById as jest.Mock).mockReturnValue(findByIdChain(app));
      (policyModel.findOne as jest.Mock).mockReturnValue(execResolved(null)); // no policy = defaults
      (applicationModel.findOneAndUpdate as jest.Mock).mockReturnValue(
        execResolved(withdrawn),
      );

      const result = await service.withdraw(applicationId, applicantId, confirmDto);

      expect(result.application.status).toBe(ScholarshipApplicationStatus.WITHDRAWN);
      expect(result.releasesCapacity).toBe(true); // default policy
    });

    it('withdraws an UNDER_REVIEW application', async () => {
      const app = makeApplication({ status: ScholarshipApplicationStatus.UNDER_REVIEW });
      const withdrawn = { ...app, status: ScholarshipApplicationStatus.WITHDRAWN };
      (applicationModel.findById as jest.Mock).mockReturnValue(findByIdChain(app));
      (policyModel.findOne as jest.Mock).mockReturnValue(execResolved(null));
      (applicationModel.findOneAndUpdate as jest.Mock).mockReturnValue(
        execResolved(withdrawn),
      );

      const result = await service.withdraw(applicationId, applicantId, confirmDto);
      expect(result.application.status).toBe(ScholarshipApplicationStatus.WITHDRAWN);
    });

    it('throws NOT_FOUND when application does not exist', async () => {
      (applicationModel.findById as jest.Mock).mockReturnValue(findByIdChain(null));

      await expect(
        service.withdraw(applicationId, applicantId, confirmDto),
      ).rejects.toMatchObject({ errorCode: ErrorCode.RES_SCHOLARSHIP_APPLICATION_NOT_FOUND });
    });

    it('throws FORBIDDEN when applicant does not own the application', async () => {
      const app = makeApplication({ applicantId: 'other-student' });
      (applicationModel.findById as jest.Mock).mockReturnValue(findByIdChain(app));

      await expect(
        service.withdraw(applicationId, applicantId, confirmDto),
      ).rejects.toMatchObject({ errorCode: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS });
    });

    it('throws BIZ_APPROVED_APPLICATION_NOT_WITHDRAWABLE for approved applications', async () => {
      const app = makeApplication({ status: ScholarshipApplicationStatus.APPROVED });
      (applicationModel.findById as jest.Mock).mockReturnValue(findByIdChain(app));

      await expect(
        service.withdraw(applicationId, applicantId, confirmDto),
      ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_APPROVED_APPLICATION_NOT_WITHDRAWABLE });
    });

    it('throws BIZ_APPLICATION_NOT_WITHDRAWABLE for already-withdrawn applications', async () => {
      const app = makeApplication({ status: ScholarshipApplicationStatus.WITHDRAWN });
      (applicationModel.findById as jest.Mock).mockReturnValue(findByIdChain(app));

      await expect(
        service.withdraw(applicationId, applicantId, confirmDto),
      ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_APPLICATION_NOT_WITHDRAWABLE });
    });

    it('throws BIZ_WITHDRAWAL_NOT_ALLOWED when policy disables self-withdrawal', async () => {
      const app = makeApplication();
      const policy = { selfWithdrawalAllowed: false, windowAfterSubmissionHours: 0 };
      (applicationModel.findById as jest.Mock).mockReturnValue(findByIdChain(app));
      (policyModel.findOne as jest.Mock).mockReturnValue(execResolved(policy));

      await expect(
        service.withdraw(applicationId, applicantId, confirmDto),
      ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_WITHDRAWAL_NOT_ALLOWED });
    });

    it('throws BIZ_WITHDRAWAL_WINDOW_EXPIRED when window has elapsed', async () => {
      const app = makeApplication({
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
      });
      const policy = {
        selfWithdrawalAllowed: true,
        windowAfterSubmissionHours: 2, // 2 hour window
        requiresConfirmation: true,
        releasesCapacityOnWithdrawal: true,
      };
      (applicationModel.findById as jest.Mock).mockReturnValue(findByIdChain(app));
      (policyModel.findOne as jest.Mock).mockReturnValue(execResolved(policy));

      await expect(
        service.withdraw(applicationId, applicantId, confirmDto),
      ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_WITHDRAWAL_WINDOW_EXPIRED });
    });

    it('does NOT release capacity when policy.releasesCapacityOnWithdrawal is false', async () => {
      const app = makeApplication();
      const policy = {
        selfWithdrawalAllowed: true,
        windowAfterSubmissionHours: 0,
        requiresConfirmation: true,
        releasesCapacityOnWithdrawal: false,
      };
      const withdrawn = { ...app, status: ScholarshipApplicationStatus.WITHDRAWN };
      (applicationModel.findById as jest.Mock).mockReturnValue(findByIdChain(app));
      (policyModel.findOne as jest.Mock).mockReturnValue(execResolved(policy));
      (applicationModel.findOneAndUpdate as jest.Mock).mockReturnValue(
        execResolved(withdrawn),
      );

      const result = await service.withdraw(applicationId, applicantId, confirmDto);
      expect(result.releasesCapacity).toBe(false);
    });

    it('preserves review history fields on withdrawal', async () => {
      const app = makeApplication({
        decidedAt: new Date('2026-01-01'),
        decidedBy: 'reviewer-1',
        decisionReason: 'Pending secondary review',
      });
      const withdrawn = { ...app, status: ScholarshipApplicationStatus.WITHDRAWN };
      (applicationModel.findById as jest.Mock).mockReturnValue(findByIdChain(app));
      (policyModel.findOne as jest.Mock).mockReturnValue(execResolved(null));
      (applicationModel.findOneAndUpdate as jest.Mock).mockReturnValue(
        execResolved(withdrawn),
      );

      // Verify update call does NOT include $unset for review fields
      await service.withdraw(applicationId, applicantId, confirmDto);
      const updateCall = (applicationModel.findOneAndUpdate as jest.Mock).mock.calls[0][1];
      expect(updateCall).not.toHaveProperty('$unset');
      expect(updateCall.$set).toHaveProperty('withdrawnAt');
      expect(updateCall.$set).toHaveProperty('withdrawnBy', applicantId);
    });
  });
});
