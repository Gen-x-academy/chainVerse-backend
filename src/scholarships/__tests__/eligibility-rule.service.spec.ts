import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  EligibilityRule,
  EligibilityRuleDocument,
  EligibilityRuleType,
  RuleOperator,
} from '../schemas/eligibility-rule.schema';
import {
  ScholarshipProgram,
  ScholarshipProgramDocument,
} from '../schemas/scholarship-program.schema';
import { EligibilityRuleService } from '../services/eligibility-rule.service';
import { ErrorCode } from '../../common/errors/error-codes.enum';

describe('EligibilityRuleService', () => {
  let service: EligibilityRuleService;
  let ruleModel: jest.Mocked<Model<EligibilityRuleDocument>>;
  let programModel: jest.Mocked<Model<ScholarshipProgramDocument>>;

  const programId = '507f1f77bcf86cd799439011';
  const orgId = 'org-1';

  const makeRule = (overrides: Record<string, unknown> = {}) => ({
    _id: '507f1f77bcf86cd799439099',
    organizationId: orgId,
    programId,
    ruleType: EligibilityRuleType.MIN_GPA,
    operator: RuleOperator.AND,
    parameters: { minGpa: 3.5 },
    isRequired: true,
    createdBy: 'admin-1',
    ...overrides,
  });

  const execResolved = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });

  const queryChain = (value: unknown) => ({
    sort: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EligibilityRuleService,
        {
          provide: getModelToken(EligibilityRule.name),
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

    service = module.get(EligibilityRuleService);
    ruleModel = module.get(getModelToken(EligibilityRule.name));
    programModel = module.get(getModelToken(ScholarshipProgram.name));
  });

  describe('addRule', () => {
    it('adds a new eligibility rule successfully', async () => {
      const program = { _id: programId, organizationId: orgId };
      const rule = makeRule();
      (programModel.findOne as jest.Mock).mockReturnValue(execResolved(program));
      (ruleModel.findOne as jest.Mock).mockReturnValue(execResolved(null));
      (ruleModel.create as jest.Mock).mockResolvedValue(rule);

      const result = await service.addRule(
        orgId,
        programId,
        {
          ruleType: EligibilityRuleType.MIN_GPA,
          operator: RuleOperator.AND,
          parameters: { minGpa: 3.5 },
          isRequired: true,
        },
        'admin-1',
      );

      expect(result.ruleType).toBe(EligibilityRuleType.MIN_GPA);
    });

    it('throws CONFLICT when rule of same type already exists', async () => {
      const program = { _id: programId };
      (programModel.findOne as jest.Mock).mockReturnValue(execResolved(program));
      (ruleModel.findOne as jest.Mock).mockReturnValue(execResolved(makeRule()));

      await expect(
        service.addRule(orgId, programId, {
          ruleType: EligibilityRuleType.MIN_GPA,
          operator: RuleOperator.AND,
          parameters: {},
          isRequired: true,
        }, 'admin-1'),
      ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_ELIGIBILITY_RULE_CONFLICT });
    });

    it('throws NOT_FOUND when program does not exist', async () => {
      (programModel.findOne as jest.Mock).mockReturnValue(execResolved(null));

      await expect(
        service.addRule(orgId, programId, {
          ruleType: EligibilityRuleType.MIN_GPA,
          operator: RuleOperator.AND,
          parameters: {},
          isRequired: true,
        }, 'admin-1'),
      ).rejects.toMatchObject({ errorCode: ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND });
    });
  });

  describe('evaluateApplicant', () => {
    it('returns eligible=true when all AND rules pass', async () => {
      const rules = [
        makeRule({ ruleType: EligibilityRuleType.MIN_GPA, parameters: { minGpa: 3.0 } }),
        makeRule({ ruleType: EligibilityRuleType.MIN_AGE, parameters: { minAge: 18 } }),
      ];
      (ruleModel.find as jest.Mock).mockReturnValue(execResolved(rules));

      const result = await service.evaluateApplicant(programId, {
        gpa: 3.5,
        age: 22,
      });

      expect(result.eligible).toBe(true);
      expect(result.failedRules).toHaveLength(0);
    });

    it('returns eligible=false when a required AND rule fails', async () => {
      const rules = [
        makeRule({ ruleType: EligibilityRuleType.MIN_GPA, parameters: { minGpa: 3.8 } }),
      ];
      (ruleModel.find as jest.Mock).mockReturnValue(execResolved(rules));

      const result = await service.evaluateApplicant(programId, { gpa: 3.2 });

      expect(result.eligible).toBe(false);
      expect(result.failedRules[0].ruleType).toBe(EligibilityRuleType.MIN_GPA);
    });

    it('is deterministic: same inputs produce same result', async () => {
      const rules = [
        makeRule({ ruleType: EligibilityRuleType.INCOME_BAND, parameters: { maxAnnualIncomeUsd: 50000 } }),
      ];
      (ruleModel.find as jest.Mock).mockReturnValue(execResolved(rules));

      const claims = { annualIncomeUsd: 45000 };
      const r1 = await service.evaluateApplicant(programId, claims);

      (ruleModel.find as jest.Mock).mockReturnValue(execResolved(rules));
      const r2 = await service.evaluateApplicant(programId, claims);

      expect(r1.eligible).toBe(r2.eligible);
    });

    it('passes advisory rules do not block when optional rule fails', async () => {
      const rules = [
        makeRule({
          ruleType: EligibilityRuleType.GEOGRAPHY,
          parameters: { countries: ['US'] },
          isRequired: false, // advisory
        }),
      ];
      (ruleModel.find as jest.Mock).mockReturnValue(execResolved(rules));

      const result = await service.evaluateApplicant(programId, { country: 'NG' });

      expect(result.eligible).toBe(true);
      expect(result.failedRules).toHaveLength(1);
      expect(result.failedRules[0].isRequired).toBe(false);
    });
  });

  describe('validateBeforePublish', () => {
    it('passes when MIN_AGE <= MAX_AGE', async () => {
      const rules = [
        makeRule({ ruleType: EligibilityRuleType.MIN_AGE, parameters: { minAge: 18 } }),
        makeRule({ ruleType: EligibilityRuleType.MAX_AGE, parameters: { maxAge: 30 } }),
      ];
      (ruleModel.find as jest.Mock).mockReturnValue(execResolved(rules));

      await expect(service.validateBeforePublish(programId)).resolves.toBeUndefined();
    });

    it('throws CONFLICT when MIN_AGE > MAX_AGE (contradiction)', async () => {
      const rules = [
        makeRule({ ruleType: EligibilityRuleType.MIN_AGE, parameters: { minAge: 40 } }),
        makeRule({ ruleType: EligibilityRuleType.MAX_AGE, parameters: { maxAge: 25 } }),
      ];
      (ruleModel.find as jest.Mock).mockReturnValue(execResolved(rules));

      await expect(service.validateBeforePublish(programId)).rejects.toMatchObject({
        errorCode: ErrorCode.BIZ_ELIGIBILITY_RULE_CONFLICT,
      });
    });
  });
});
