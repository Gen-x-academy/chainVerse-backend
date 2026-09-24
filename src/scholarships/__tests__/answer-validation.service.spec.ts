import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ScholarshipApplication,
  ScholarshipApplicationDocument,
} from '../schemas/scholarship-application.schema';
import {
  ScholarshipProgram,
  ScholarshipProgramDocument,
  ScholarshipProgramStatus,
} from '../schemas/scholarship-program.schema';
import {
  ProgramTermsVersion,
  ProgramTermsVersionDocument,
  TermsVersionStatus,
} from '../schemas/program-terms-version.schema';
import { PaginationService } from '../../common/pagination/pagination.service';
import { ScholarshipApplicationsService, countWords, validateAnswers } from '../services/scholarship-applications.service';
import { ScholarshipProgramsService } from '../services/scholarship-programs.service';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { AnswerDto, DEFAULT_ANSWER_WORD_LIMIT } from '../dto/answer.dto';

// ── Helper factories ──────────────────────────────────────────────────────────

const makeObjectId = () => new Types.ObjectId();

const PROGRAM_ID = new Types.ObjectId();
const ORG_ID = 'org-1';
const APPLICANT_ID = 'user-1';
const ACTOR_ID = 'staff-1';
const TERMS_ID = new Types.ObjectId();
const FIELD_ID_1 = new Types.ObjectId();
const FIELD_ID_2 = new Types.ObjectId();

const makeField = (overrides: Partial<{
  _id: Types.ObjectId;
  label: string;
  required: boolean;
  wordLimit: number | null;
}> = {}) => ({
  _id: overrides._id ?? makeObjectId(),
  label: overrides.label ?? 'Essay question',
  required: overrides.required ?? false,
  wordLimit: overrides.wordLimit !== undefined ? overrides.wordLimit : null,
});

const makeProgram = (overrides: Record<string, unknown> = {}) => ({
  _id: PROGRAM_ID,
  organizationId: ORG_ID,
  title: 'STEM Scholars',
  status: ScholarshipProgramStatus.PUBLISHED,
  currentTermsVersionNumber: 1,
  createdBy: ACTOR_ID,
  formFields: [],
  statusChangedAt: null,
  statusChangedBy: null,
  statusHistory: [],
  ...overrides,
});

const makeTerms = (overrides: Record<string, unknown> = {}) => ({
  _id: TERMS_ID,
  organizationId: ORG_ID,
  programId: PROGRAM_ID,
  versionNumber: 1,
  status: TermsVersionStatus.PUBLISHED,
  eligibility: { minGpa: 3.5 },
  deadlines: { closesAt: '2026-12-01' },
  awardValue: 5000,
  awardCurrency: 'USD',
  obligations: [],
  publishedAt: new Date(),
  ...overrides,
});

const execResolved = (value: unknown) => ({
  exec: jest.fn().mockResolvedValue(value),
});

// ── countWords unit tests ─────────────────────────────────────────────────────

describe('countWords()', () => {
  it('returns 0 for undefined', () => expect(countWords(undefined)).toBe(0));
  it('returns 0 for null', () => expect(countWords(null)).toBe(0));
  it('returns 0 for blank string', () => expect(countWords('   ')).toBe(0));
  it('counts single word', () => expect(countWords('hello')).toBe(1));
  it('counts multiple words', () => expect(countWords('hello world foo')).toBe(3));
  it('collapses internal whitespace', () => expect(countWords('  a   b  ')).toBe(2));
  it('counts hyphenated words as one', () => expect(countWords('well-known')).toBe(1));
});

// ── validateAnswers unit tests ────────────────────────────────────────────────

describe('validateAnswers()', () => {
  const field1 = makeField({ _id: FIELD_ID_1, label: 'Why do you deserve this?', required: true, wordLimit: 100 });
  const field2 = makeField({ _id: FIELD_ID_2, label: 'Extra details', required: false, wordLimit: 50 });

  it('passes for an empty answers array with no required fields', () => {
    expect(() => validateAnswers([], [field2])).not.toThrow();
  });

  it('throws VAL_ANSWER_DUPLICATE_FIELD for duplicate fieldId', () => {
    const answers: AnswerDto[] = [
      { fieldId: FIELD_ID_1.toString(), value: 'hello world' },
      { fieldId: FIELD_ID_1.toString(), value: 'duplicate' },
    ];
    expect(() => validateAnswers(answers, [field1])).toMatchObject({
      errorCode: ErrorCode.VAL_ANSWER_DUPLICATE_FIELD,
    });
  });

  it('throws VAL_ANSWER_UNKNOWN_FIELD for an unrecognized fieldId', () => {
    const answers: AnswerDto[] = [
      { fieldId: makeObjectId().toString(), value: 'test' },
    ];
    expect(() => validateAnswers(answers, [field1, field2])).toMatchObject({
      errorCode: ErrorCode.VAL_ANSWER_UNKNOWN_FIELD,
    });
  });

  it('throws VAL_ANSWER_REQUIRED_FIELD_MISSING when required field has no answer', () => {
    expect(() => validateAnswers([], [field1])).toMatchObject({
      errorCode: ErrorCode.VAL_ANSWER_REQUIRED_FIELD_MISSING,
    });
  });

  it('throws VAL_ANSWER_WORD_LIMIT_EXCEEDED when answer exceeds field wordLimit', () => {
    const longText = 'word '.repeat(101).trim(); // 101 words
    const answers: AnswerDto[] = [
      { fieldId: FIELD_ID_1.toString(), value: longText },
    ];
    expect(() => validateAnswers(answers, [field1])).toMatchObject({
      errorCode: ErrorCode.VAL_ANSWER_WORD_LIMIT_EXCEEDED,
    });
  });

  it('uses DEFAULT_ANSWER_WORD_LIMIT when field has no wordLimit', () => {
    const noLimitField = makeField({ _id: FIELD_ID_1, label: 'Anything', required: false, wordLimit: null });
    const longText = 'word '.repeat(DEFAULT_ANSWER_WORD_LIMIT + 1).trim();
    const answers: AnswerDto[] = [
      { fieldId: FIELD_ID_1.toString(), value: longText },
    ];
    expect(() => validateAnswers(answers, [noLimitField])).toMatchObject({
      errorCode: ErrorCode.VAL_ANSWER_WORD_LIMIT_EXCEEDED,
    });
  });

  it('passes when all required fields are answered within word limits', () => {
    const answers: AnswerDto[] = [
      { fieldId: FIELD_ID_1.toString(), value: 'I am a great student with passion.' },
      { fieldId: FIELD_ID_2.toString(), value: 'Extra note here.' },
    ];
    expect(() => validateAnswers(answers, [field1, field2])).not.toThrow();
  });
});

// ── ScholarshipApplicationsService.apply integration tests ────────────────────

describe('ScholarshipApplicationsService.apply — answer validation', () => {
  let service: ScholarshipApplicationsService;
  let applicationModel: jest.Mocked<Model<ScholarshipApplicationDocument>>;
  let programModel: jest.Mocked<Model<ScholarshipProgramDocument>>;
  let termsModel: jest.Mocked<Model<ProgramTermsVersionDocument>>;

  beforeEach(async () => {
    applicationModel = {
      create: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Model<ScholarshipApplicationDocument>>;

    programModel = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Model<ScholarshipProgramDocument>>;

    termsModel = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Model<ProgramTermsVersionDocument>>;

    const paginationService = {
      paginate: jest.fn(),
    } as unknown as jest.Mocked<PaginationService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScholarshipApplicationsService,
        { provide: getModelToken(ScholarshipApplication.name), useValue: applicationModel },
        { provide: getModelToken(ScholarshipProgram.name), useValue: programModel },
        { provide: getModelToken(ProgramTermsVersion.name), useValue: termsModel },
        { provide: PaginationService, useValue: paginationService },
      ],
    }).compile();

    service = module.get<ScholarshipApplicationsService>(ScholarshipApplicationsService);
  });

  it('rejects an application with answers exceeding the word limit', async () => {
    const field = makeField({ _id: FIELD_ID_1, label: 'Why this scholarship?', required: true, wordLimit: 10 });
    programModel.findOne.mockReturnValue(
      execResolved(makeProgram({ formFields: [field] })) as never,
    );
    termsModel.findOne.mockReturnValue(execResolved(makeTerms()) as never);
    applicationModel.findOne.mockReturnValue(execResolved(null) as never);

    const longValue = 'word '.repeat(11).trim(); // 11 words > limit 10
    await expect(
      service.apply(
        {
          organizationId: ORG_ID,
          programId: PROGRAM_ID.toString(),
          acceptedTermsVersionId: TERMS_ID.toString(),
          answers: [{ fieldId: FIELD_ID_1.toString(), value: longValue }],
        },
        APPLICANT_ID,
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VAL_ANSWER_WORD_LIMIT_EXCEEDED });
  });

  it('rejects when a required field has no answer', async () => {
    const field = makeField({ _id: FIELD_ID_1, label: 'Required essay', required: true, wordLimit: 100 });
    programModel.findOne.mockReturnValue(
      execResolved(makeProgram({ formFields: [field] })) as never,
    );
    termsModel.findOne.mockReturnValue(execResolved(makeTerms()) as never);
    applicationModel.findOne.mockReturnValue(execResolved(null) as never);

    await expect(
      service.apply(
        {
          organizationId: ORG_ID,
          programId: PROGRAM_ID.toString(),
          acceptedTermsVersionId: TERMS_ID.toString(),
          answers: [],
        },
        APPLICANT_ID,
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VAL_ANSWER_REQUIRED_FIELD_MISSING });
  });

  it('persists server-computed word counts alongside answers', async () => {
    const field = makeField({ _id: FIELD_ID_1, label: 'Short answer', required: true, wordLimit: 20 });
    programModel.findOne.mockReturnValue(
      execResolved(makeProgram({ formFields: [field] })) as never,
    );
    termsModel.findOne.mockReturnValue(execResolved(makeTerms()) as never);
    applicationModel.findOne.mockReturnValue(execResolved(null) as never);
    applicationModel.create.mockResolvedValue({} as never);

    await service.apply(
      {
        organizationId: ORG_ID,
        programId: PROGRAM_ID.toString(),
        acceptedTermsVersionId: TERMS_ID.toString(),
        answers: [{ fieldId: FIELD_ID_1.toString(), value: 'three words here' }],
      },
      APPLICANT_ID,
    );

    expect(applicationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: [
          expect.objectContaining({
            wordCount: 3,
          }),
        ],
      }),
    );
  });

  it('accepts an application with no form fields and empty answers', async () => {
    programModel.findOne.mockReturnValue(
      execResolved(makeProgram({ formFields: [] })) as never,
    );
    termsModel.findOne.mockReturnValue(execResolved(makeTerms()) as never);
    applicationModel.findOne.mockReturnValue(execResolved(null) as never);
    applicationModel.create.mockResolvedValue({} as never);

    await expect(
      service.apply(
        {
          organizationId: ORG_ID,
          programId: PROGRAM_ID.toString(),
          acceptedTermsVersionId: TERMS_ID.toString(),
          answers: [],
        },
        APPLICANT_ID,
      ),
    ).resolves.not.toThrow();
  });
});

// ── ScholarshipProgramsService.transitionProgramStatus tests ─────────────────

describe('ScholarshipProgramsService.transitionProgramStatus', () => {
  let service: ScholarshipProgramsService;
  let programModel: jest.Mocked<Model<ScholarshipProgramDocument>>;
  let termsModel: jest.Mocked<Model<ProgramTermsVersionDocument>>;

  beforeEach(async () => {
    programModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      updateOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
    } as unknown as jest.Mocked<Model<ScholarshipProgramDocument>>;

    termsModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      updateMany: jest.fn(),
      findOneAndUpdate: jest.fn(),
    } as unknown as jest.Mocked<Model<ProgramTermsVersionDocument>>;

    const paginationService = {
      paginate: jest.fn(),
    } as unknown as jest.Mocked<PaginationService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScholarshipProgramsService,
        { provide: getModelToken(ScholarshipProgram.name), useValue: programModel },
        { provide: getModelToken(ProgramTermsVersion.name), useValue: termsModel },
        { provide: PaginationService, useValue: paginationService },
      ],
    }).compile();

    service = module.get<ScholarshipProgramsService>(ScholarshipProgramsService);
  });

  const stubProgram = (status: ScholarshipProgramStatus) => {
    const prog = makeProgram({ status });
    programModel.findOne.mockReturnValue(execResolved(prog) as never);
    programModel.findOneAndUpdate.mockReturnValue(
      execResolved({ ...prog, status }) as never,
    );
  };

  it('allows DRAFT → PUBLISHED', async () => {
    stubProgram(ScholarshipProgramStatus.DRAFT);
    await expect(
      service.transitionProgramStatus(ORG_ID, PROGRAM_ID.toString(), ScholarshipProgramStatus.PUBLISHED, ACTOR_ID),
    ).resolves.toBeDefined();
    expect(programModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: ScholarshipProgramStatus.DRAFT }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: ScholarshipProgramStatus.PUBLISHED }),
        $push: expect.objectContaining({ statusHistory: expect.objectContaining({ status: ScholarshipProgramStatus.PUBLISHED, changedBy: ACTOR_ID }) }),
      }),
      { new: true },
    );
  });

  it('allows PUBLISHED → PAUSED', async () => {
    stubProgram(ScholarshipProgramStatus.PUBLISHED);
    await expect(
      service.transitionProgramStatus(ORG_ID, PROGRAM_ID.toString(), ScholarshipProgramStatus.PAUSED, ACTOR_ID),
    ).resolves.toBeDefined();
  });

  it('allows PAUSED → PUBLISHED', async () => {
    stubProgram(ScholarshipProgramStatus.PAUSED);
    await expect(
      service.transitionProgramStatus(ORG_ID, PROGRAM_ID.toString(), ScholarshipProgramStatus.PUBLISHED, ACTOR_ID),
    ).resolves.toBeDefined();
  });

  it('allows PUBLISHED → CLOSED', async () => {
    stubProgram(ScholarshipProgramStatus.PUBLISHED);
    await expect(
      service.transitionProgramStatus(ORG_ID, PROGRAM_ID.toString(), ScholarshipProgramStatus.CLOSED, ACTOR_ID),
    ).resolves.toBeDefined();
  });

  it('allows CLOSED → ARCHIVED', async () => {
    stubProgram(ScholarshipProgramStatus.CLOSED);
    await expect(
      service.transitionProgramStatus(ORG_ID, PROGRAM_ID.toString(), ScholarshipProgramStatus.ARCHIVED, ACTOR_ID),
    ).resolves.toBeDefined();
  });

  it('rejects DRAFT → PAUSED (illegal transition)', async () => {
    stubProgram(ScholarshipProgramStatus.DRAFT);
    await expect(
      service.transitionProgramStatus(ORG_ID, PROGRAM_ID.toString(), ScholarshipProgramStatus.PAUSED, ACTOR_ID),
    ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_PROGRAM_INVALID_TRANSITION });
  });

  it('rejects DRAFT → CLOSED (illegal transition)', async () => {
    stubProgram(ScholarshipProgramStatus.DRAFT);
    await expect(
      service.transitionProgramStatus(ORG_ID, PROGRAM_ID.toString(), ScholarshipProgramStatus.CLOSED, ACTOR_ID),
    ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_PROGRAM_INVALID_TRANSITION });
  });

  it('rejects ARCHIVED → PUBLISHED (terminal state)', async () => {
    stubProgram(ScholarshipProgramStatus.ARCHIVED);
    await expect(
      service.transitionProgramStatus(ORG_ID, PROGRAM_ID.toString(), ScholarshipProgramStatus.PUBLISHED, ACTOR_ID),
    ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_PROGRAM_ARCHIVED });
  });

  it('records actor and timestamp in statusHistory', async () => {
    stubProgram(ScholarshipProgramStatus.DRAFT);
    await service.transitionProgramStatus(
      ORG_ID,
      PROGRAM_ID.toString(),
      ScholarshipProgramStatus.PUBLISHED,
      ACTOR_ID,
    );
    expect(programModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          statusChangedBy: ACTOR_ID,
          statusChangedAt: expect.any(Date),
        }),
        $push: expect.objectContaining({
          statusHistory: expect.objectContaining({
            changedBy: ACTOR_ID,
            changedAt: expect.any(Date),
          }),
        }),
      }),
      { new: true },
    );
  });

  it('throws RES_SCHOLARSHIP_PROGRAM_NOT_FOUND for out-of-tenant program', async () => {
    programModel.findOne.mockReturnValue(execResolved(null) as never);
    await expect(
      service.transitionProgramStatus('other-org', PROGRAM_ID.toString(), ScholarshipProgramStatus.PUBLISHED, ACTOR_ID),
    ).rejects.toMatchObject({ errorCode: ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND });
  });
});
