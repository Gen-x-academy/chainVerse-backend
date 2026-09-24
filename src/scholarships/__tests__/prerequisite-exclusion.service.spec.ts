import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ProgramPrerequisite,
  ProgramPrerequisiteDocument,
  PrerequisiteType,
} from '../schemas/program-prerequisite.schema';
import {
  ProgramExclusion,
  ProgramExclusionDocument,
  ExclusionType,
  ExclusionReasonCode,
} from '../schemas/program-exclusion.schema';
import {
  ScholarshipProgram,
  ScholarshipProgramDocument,
} from '../schemas/scholarship-program.schema';
import { PrerequisiteExclusionService } from '../services/prerequisite-exclusion.service';
import { ErrorCode } from '../../common/errors/error-codes.enum';

describe('PrerequisiteExclusionService', () => {
  let service: PrerequisiteExclusionService;
  let prerequisiteModel: jest.Mocked<Model<ProgramPrerequisiteDocument>>;
  let exclusionModel: jest.Mocked<Model<ProgramExclusionDocument>>;
  let programModel: jest.Mocked<Model<ScholarshipProgramDocument>>;

  const programId = '507f1f77bcf86cd799439011';
  const orgId = 'org-1';

  const execResolved = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });

  const sortExecResolved = (value: unknown) => ({
    sort: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrerequisiteExclusionService,
        {
          provide: getModelToken(ProgramPrerequisite.name),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            deleteOne: jest.fn(),
          },
        },
        {
          provide: getModelToken(ProgramExclusion.name),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            deleteOne: jest.fn(),
          },
        },
        {
          provide: getModelToken(ScholarshipProgram.name),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(PrerequisiteExclusionService);
    prerequisiteModel = module.get(getModelToken(ProgramPrerequisite.name));
    exclusionModel = module.get(getModelToken(ProgramExclusion.name));
    programModel = module.get(getModelToken(ScholarshipProgram.name));
  });

  // ── Prerequisites ───────────────────────────────────────────────────────────

  describe('addPrerequisite', () => {
    it('adds a prerequisite successfully', async () => {
      const program = { _id: programId };
      const prereq = {
        programId,
        prerequisiteType: PrerequisiteType.ACHIEVEMENT,
        referenceId: 'badge-xyz',
        isRequired: true,
      };
      (programModel.findOne as jest.Mock).mockReturnValue(execResolved(program));
      (prerequisiteModel.findOne as jest.Mock).mockReturnValue(execResolved(null));
      (prerequisiteModel.create as jest.Mock).mockResolvedValue(prereq);

      const result = await service.addPrerequisite(orgId, programId, {
        prerequisiteType: PrerequisiteType.ACHIEVEMENT,
        referenceId: 'badge-xyz',
        isRequired: true,
      }, 'admin-1');

      expect(result.prerequisiteType).toBe(PrerequisiteType.ACHIEVEMENT);
    });

    it('throws CONFLICT when duplicate prerequisite exists', async () => {
      const program = { _id: programId };
      (programModel.findOne as jest.Mock).mockReturnValue(execResolved(program));
      (prerequisiteModel.findOne as jest.Mock).mockReturnValue(
        execResolved({ _id: 'existing' }),
      );

      await expect(
        service.addPrerequisite(orgId, programId, {
          prerequisiteType: PrerequisiteType.ACHIEVEMENT,
          referenceId: 'badge-xyz',
          isRequired: true,
        }, 'admin-1'),
      ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_PREREQUISITE_DUPLICATE });
    });
  });

  describe('evaluatePrerequisites', () => {
    it('returns met=true when all required prerequisites are fulfilled', async () => {
      const rules = [
        { prerequisiteType: PrerequisiteType.ACHIEVEMENT, referenceId: 'badge-1', isRequired: true },
        { prerequisiteType: PrerequisiteType.COURSE_COMPLETION, referenceId: 'course-2', isRequired: true },
      ];
      (prerequisiteModel.find as jest.Mock).mockReturnValue(execResolved(rules));

      const result = await service.evaluatePrerequisites(programId, ['badge-1', 'course-2']);
      expect(result.met).toBe(true);
      expect(result.unmet).toHaveLength(0);
    });

    it('returns met=false when a required prerequisite is not fulfilled', async () => {
      const rules = [
        { prerequisiteType: PrerequisiteType.ACHIEVEMENT, referenceId: 'badge-1', isRequired: true },
      ];
      (prerequisiteModel.find as jest.Mock).mockReturnValue(execResolved(rules));

      const result = await service.evaluatePrerequisites(programId, []);
      expect(result.met).toBe(false);
      expect(result.unmet[0].isRequired).toBe(true);
    });

    it('is deterministic — same inputs yield same result', async () => {
      const rules = [
        { prerequisiteType: PrerequisiteType.MIN_GPA, referenceId: 'gpa-3.5', isRequired: true },
      ];
      (prerequisiteModel.find as jest.Mock).mockReturnValue(execResolved(rules));
      const r1 = await service.evaluatePrerequisites(programId, ['gpa-3.5']);

      (prerequisiteModel.find as jest.Mock).mockReturnValue(execResolved(rules));
      const r2 = await service.evaluatePrerequisites(programId, ['gpa-3.5']);

      expect(r1.met).toBe(r2.met);
    });
  });

  // ── Exclusions ──────────────────────────────────────────────────────────────

  describe('addExclusion', () => {
    it('adds an exclusion with stable reason code', async () => {
      const program = { _id: programId };
      const excl = {
        exclusionType: ExclusionType.CONCURRENT_SCHOLARSHIP,
        reasonCode: ExclusionReasonCode.CONCURRENT_NOT_ALLOWED,
      };
      (programModel.findOne as jest.Mock).mockReturnValue(execResolved(program));
      (exclusionModel.findOne as jest.Mock).mockReturnValue(execResolved(null));
      (exclusionModel.create as jest.Mock).mockResolvedValue(excl);

      const result = await service.addExclusion(orgId, programId, {
        exclusionType: ExclusionType.CONCURRENT_SCHOLARSHIP,
        reasonCode: ExclusionReasonCode.CONCURRENT_NOT_ALLOWED,
      }, 'admin-1');

      expect(result.reasonCode).toBe(ExclusionReasonCode.CONCURRENT_NOT_ALLOWED);
    });

    it('throws CONFLICT on duplicate exclusion type', async () => {
      const program = { _id: programId };
      (programModel.findOne as jest.Mock).mockReturnValue(execResolved(program));
      (exclusionModel.findOne as jest.Mock).mockReturnValue(
        execResolved({ _id: 'existing' }),
      );

      await expect(
        service.addExclusion(orgId, programId, {
          exclusionType: ExclusionType.CONCURRENT_SCHOLARSHIP,
          reasonCode: ExclusionReasonCode.CONCURRENT_NOT_ALLOWED,
        }, 'admin-1'),
      ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_EXCLUSION_DUPLICATE });
    });
  });

  describe('evaluateExclusions', () => {
    it('excludes applicant holding a concurrent scholarship', async () => {
      const rules = [
        {
          exclusionType: ExclusionType.CONCURRENT_SCHOLARSHIP,
          reasonCode: ExclusionReasonCode.CONCURRENT_NOT_ALLOWED,
          parameters: {},
          description: 'No concurrent awards',
        },
      ];
      (exclusionModel.find as jest.Mock).mockReturnValue(execResolved(rules));

      const result = await service.evaluateExclusions(programId, {
        activeScholarshipIds: ['scholarship-abc'],
      });

      expect(result.excluded).toBe(true);
      expect(result.reasons[0].reasonCode).toBe(ExclusionReasonCode.CONCURRENT_NOT_ALLOWED);
    });

    it('does not exclude applicant with no active scholarships', async () => {
      const rules = [
        {
          exclusionType: ExclusionType.CONCURRENT_SCHOLARSHIP,
          reasonCode: ExclusionReasonCode.CONCURRENT_NOT_ALLOWED,
          parameters: {},
        },
      ];
      (exclusionModel.find as jest.Mock).mockReturnValue(execResolved(rules));

      const result = await service.evaluateExclusions(programId, {
        activeScholarshipIds: [],
      });

      expect(result.excluded).toBe(false);
    });

    it('decisions are reproducible — same claims same result', async () => {
      const rules = [
        {
          exclusionType: ExclusionType.EMPLOYMENT_STATUS,
          reasonCode: ExclusionReasonCode.INELIGIBLE_EMPLOYMENT_STATUS,
          parameters: { disallowedStatuses: ['employed'] },
        },
      ];
      (exclusionModel.find as jest.Mock).mockReturnValue(execResolved(rules));
      const r1 = await service.evaluateExclusions(programId, { employmentStatus: 'employed' });

      (exclusionModel.find as jest.Mock).mockReturnValue(execResolved(rules));
      const r2 = await service.evaluateExclusions(programId, { employmentStatus: 'employed' });

      expect(r1.excluded).toBe(r2.excluded);
    });
  });

  // ── Cycle detection ─────────────────────────────────────────────────────────

  describe('validateBeforePublish', () => {
    it('passes when no self-referential cycle exists', async () => {
      (prerequisiteModel.find as jest.Mock).mockReturnValue(
        execResolved([
          { prerequisiteType: PrerequisiteType.SCHOLARSHIP_AWARD, referenceId: 'other-program' },
        ]),
      );

      await expect(service.validateBeforePublish(orgId, programId)).resolves.toBeUndefined();
    });

    it('throws BIZ_PREREQUISITE_CYCLE_DETECTED when program requires itself', async () => {
      (prerequisiteModel.find as jest.Mock).mockReturnValue(
        execResolved([
          { prerequisiteType: PrerequisiteType.SCHOLARSHIP_AWARD, referenceId: programId },
        ]),
      );

      await expect(service.validateBeforePublish(orgId, programId)).rejects.toMatchObject({
        errorCode: ErrorCode.BIZ_PREREQUISITE_CYCLE_DETECTED,
      });
    });
  });
});
