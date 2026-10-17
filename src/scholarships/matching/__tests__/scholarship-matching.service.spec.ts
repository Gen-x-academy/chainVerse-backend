import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ScholarshipProgram } from '../../schemas/scholarship-program.schema';
import { ProgramTermsVersion } from '../../schemas/program-terms-version.schema';
import { ScholarshipApplication } from '../../schemas/scholarship-application.schema';
import { EligibilityAttestation } from '../../schemas/eligibility-attestation.schema';
import { EligibilityRule, EligibilityRuleType } from '../../schemas/eligibility-rule.schema';
import {
  ScholarshipInterestProfile,
  ScholarshipMatchDismissal,
  MatchDismissalReason,
} from '../schemas/matching.schema';
import { ScholarshipMatchingService } from '../services/scholarship-matching.service';
import { MAX_INTERESTS, MatchSort } from '../dto/matching.dto';
import { ErrorCode } from '../../../common/errors/error-codes.enum';

/**
 * Service-level behaviour for personalized matching (#1176).
 *
 * The ranker maths is covered by `matching-ranker.spec.ts`. These tests cover
 * what the service adds on top: the candidate-set rules (published-only,
 * dismissals, already-applied), ownership/tenancy, the protected-trait write
 * path, and the error contract.
 */
describe('ScholarshipMatchingService', () => {
  let service: ScholarshipMatchingService;

  const programModel = { find: jest.fn(), findById: jest.fn() };
  const termsModel = { find: jest.fn() };
  const applicationModel = { find: jest.fn() };
  const attestationModel = { find: jest.fn() };
  const ruleModel = { find: jest.fn() };
  const profileModel = {
    findOne: jest.fn(),
    create: jest.fn(),
  };
  const dismissalModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  };

  const programId = '507f1f77bcf86cd799439011';
  const otherProgramId = '507f1f77bcf86cd799439012';

  /** Chainable query stub; every link resolves to `value`. */
  const chain = (value: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ['sort', 'limit', 'lean', 'select']) {
      q[m] = jest.fn().mockReturnValue(q);
    }
    q.exec = jest.fn().mockResolvedValue(value);
    return q;
  };

  const makeProgram = (overrides: Record<string, unknown> = {}) => ({
    _id: programId,
    organizationId: 'org-1',
    title: 'Stellar smart contract scholarship',
    description: 'For students building on the Stellar network.',
    status: 'published',
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: no profile, no dismissals, no applications, no rules.
    profileModel.findOne.mockReturnValue(chain(null));
    dismissalModel.find.mockReturnValue(chain([]));
    applicationModel.find.mockReturnValue(chain([]));
    ruleModel.find.mockReturnValue(chain([]));
    attestationModel.find.mockReturnValue(chain([]));
    termsModel.find.mockReturnValue(chain([]));
    programModel.find.mockReturnValue(chain([makeProgram()]));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScholarshipMatchingService,
        { provide: getModelToken(ScholarshipProgram.name), useValue: programModel },
        { provide: getModelToken(ProgramTermsVersion.name), useValue: termsModel },
        { provide: getModelToken(ScholarshipApplication.name), useValue: applicationModel },
        { provide: getModelToken(EligibilityAttestation.name), useValue: attestationModel },
        { provide: getModelToken(EligibilityRule.name), useValue: ruleModel },
        { provide: getModelToken(ScholarshipInterestProfile.name), useValue: profileModel },
        { provide: getModelToken(ScholarshipMatchDismissal.name), useValue: dismissalModel },
      ],
    }).compile();

    service = module.get<ScholarshipMatchingService>(ScholarshipMatchingService);
  });

  // ── Interest profile ────────────────────────────────────────────────────────

  describe('setInterests (#1176)', () => {
    it('normalizes and stores the interests it accepts', async () => {
      profileModel.findOne.mockReturnValue(chain(null));
      profileModel.create.mockImplementation(async (dto: Record<string, unknown>) => dto);

      const result = await service.setInterests('student-1', {
        interests: ['  Stellar  ', 'SMART contracts'],
      });

      expect(result.interests).toEqual(['stellar', 'smart contracts']);
      expect(profileModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 'student-1',
          interests: ['stellar', 'smart contracts'],
        }),
      );
    });

    it('refuses protected traits and reports exactly which tag was refused', async () => {
      profileModel.findOne.mockReturnValue(chain(null));
      profileModel.create.mockImplementation(async (dto: Record<string, unknown>) => dto);

      const result = await service.setInterests('student-1', {
        interests: ['stellar', 'black', 'veteran'],
      });

      expect(result.interests).toEqual(['stellar']);
      expect(result.rejectedInterests).toEqual(['black', 'veteran']);
    });

    it('rejects the whole request when every tag is a protected trait', async () => {
      profileModel.findOne.mockReturnValue(chain(null));

      await expect(
        service.setInterests('student-1', { interests: ['black', 'female'] }),
      ).rejects.toMatchObject({ code: ErrorCode.VAL_INVALID_INPUT });
      expect(profileModel.create).not.toHaveBeenCalled();
    });

    it('rejects more interests than the documented maximum', async () => {
      profileModel.findOne.mockReturnValue(chain(null));
      const tooMany = Array.from({ length: MAX_INTERESTS + 1 }, (_, i) => `topic${i}`);

      await expect(
        service.setInterests('student-1', { interests: tooMany }),
      ).rejects.toMatchObject({ code: ErrorCode.VAL_INVALID_INPUT });
    });

    it('updates in place when a profile already exists', async () => {
      const existing: Record<string, unknown> = { interests: ['old'], save: jest.fn() };
      profileModel.findOne.mockReturnValue(chain(existing));

      const result = await service.setInterests('student-1', { interests: ['stellar'] });

      expect(existing.save).toHaveBeenCalled();
      expect(existing.interests).toEqual(['stellar']);
      expect(result.interests).toEqual(['stellar']);
      expect(profileModel.create).not.toHaveBeenCalled();
    });

    it('recovers from a concurrent insert instead of failing the request', async () => {
      profileModel.findOne
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain({ interests: [], rejectedInterests: [], save: jest.fn() }));
      profileModel.create.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));

      const result = await service.setInterests('student-1', { interests: ['stellar'] });

      expect(result.interests).toEqual(['stellar']);
    });
  });

  // ── Cold start and opt-out ──────────────────────────────────────────────────

  describe('getProfile (#1176)', () => {
    it('returns null for a student who has never set interests', async () => {
      profileModel.findOne.mockReturnValue(chain(null));
      // A cold start is a normal state, not a 404.
      await expect(service.getProfile('student-1')).resolves.toBeNull();
    });
  });

  describe('updatePreferences (#1176)', () => {
    it('creates a profile when the student opts out before ever setting interests', async () => {
      profileModel.findOne.mockReturnValue(chain(null));
      profileModel.create.mockImplementation(async (dto: Record<string, unknown>) => dto);

      const result = await service.updatePreferences('student-1', {
        matchingOptedOut: true,
      });

      expect(result).toEqual({ matchingOptedOut: true });
      expect(profileModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: 'student-1', matchingOptedOut: true }),
      );
    });

    it('404s when there is no profile to update and no opt-out was requested', async () => {
      profileModel.findOne.mockReturnValue(chain(null));

      await expect(service.updatePreferences('student-1', {})).rejects.toMatchObject({
        code: ErrorCode.RES_NOT_FOUND,
      });
    });

    it('keeps the interests when a student only opts out', async () => {
      const existing = { matchingOptedOut: false, interests: ['stellar'], save: jest.fn() };
      profileModel.findOne.mockReturnValue(chain(existing));

      await service.updatePreferences('student-1', { matchingOptedOut: true });

      expect(existing.matchingOptedOut).toBe(true);
      // Retained so switching matching back on needs no retyping.
      expect(existing.interests).toEqual(['stellar']);
    });
  });

  // ── Dismissal ──────────────────────────────────────────────────────────────

  describe('dismiss (#1176)', () => {
    it('404s for a program that does not exist', async () => {
      programModel.findById.mockReturnValue(chain(null));

      await expect(
        service.dismiss('student-1', {
          programId,
          reason: MatchDismissalReason.NOT_INTERESTED,
        }),
      ).rejects.toMatchObject({ code: ErrorCode.RES_SCHOLARSHIP_PROGRAM_NOT_FOUND });
      expect(dismissalModel.create).not.toHaveBeenCalled();
    });

    it('records a dismissal against the student, not a caller-supplied id', async () => {
      programModel.findById.mockReturnValue(chain(makeProgram()));
      dismissalModel.findOne.mockReturnValue(chain(null));
      dismissalModel.create.mockResolvedValue(undefined);

      const result = await service.dismiss('student-1', {
        programId,
        reason: MatchDismissalReason.NOT_INTERESTED,
      });

      expect(dismissalModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: 'student-1', organizationId: 'org-1' }),
      );
      expect(result).toEqual({ programId, dismissed: true, updated: false });
    });

    it('updates the reason on re-dismiss instead of failing', async () => {
      const existing = {
        reason: MatchDismissalReason.NOT_INTERESTED,
        note: undefined as string | undefined,
        flaggedSignals: [],
        save: jest.fn(),
      };
      programModel.findById.mockReturnValue(chain(makeProgram()));
      dismissalModel.findOne.mockReturnValue(chain(existing));

      const result = await service.dismiss('student-1', {
        programId,
        reason: MatchDismissalReason.SPONSOR_NOT_WANTED,
      });

      expect(existing.reason).toBe(MatchDismissalReason.SPONSOR_NOT_WANTED);
      expect(existing.save).toHaveBeenCalled();
      expect(result.updated).toBe(true);
      // A student changing their mind must not be blocked by their own history.
      expect(dismissalModel.create).not.toHaveBeenCalled();
    });
  });

  // ── Recommendations ────────────────────────────────────────────────────────

  describe('recommendations (#1176)', () => {
    const query = { page: 1, limit: 10, sort: MatchSort.RELEVANCE };

    it('returns reasons and a cold-start flag for a student with no interests', async () => {
      const result = await service.recommendations('student-1', query);

      expect(result.personalization).toEqual({
        coldStart: true,
        optedOut: false,
        interestCount: 0,
        dismissedCount: 0,
      });
      expect(result.data[0].reasons.length).toBeGreaterThan(0);
      expect(result.data[0].score).toBeGreaterThan(0);
    });

    it('only considers published programs', async () => {
      await service.recommendations('student-1', query);

      expect(programModel.find).toHaveBeenCalledWith({
        status: { $in: ['published'] },
      });
    });

    it('excludes a dismissed program before scoring', async () => {
      dismissalModel.find.mockReturnValue(
        chain([
          {
            programId,
            organizationId: 'org-1',
            reason: MatchDismissalReason.NOT_INTERESTED,
          },
        ]),
      );

      const result = await service.recommendations('student-1', query);

      expect(result.data).toEqual([]);
      // Hard filter, not a score penalty: it must not reappear via a tie-break.
      expect(result.total).toBe(0);
    });

    it('hides the whole catalog when a sponsor is dismissed', async () => {
      programModel.find.mockReturnValue(
        chain([
          makeProgram(),
          makeProgram({
            _id: otherProgramId,
            organizationId: 'org-2',
            title: 'Another Stellar award',
          }),
        ]),
      );
      dismissalModel.find.mockReturnValue(
        chain([
          {
            programId,
            organizationId: 'org-1',
            reason: MatchDismissalReason.SPONSOR_NOT_WANTED,
          },
        ]),
      );

      const result = await service.recommendations('student-1', query);

      // org-1's program is gone; org-2's survives.
      expect(result.data.map((m: { organizationId: string }) => m.organizationId)).toEqual([
        'org-2',
      ]);
    });

    it('excludes programs already applied to unless asked', async () => {
      applicationModel.find.mockReturnValue(chain([{ programId }]));

      const excluded = await service.recommendations('student-1', query);
      expect(excluded.data).toEqual([]);

      const included = await service.recommendations('student-1', {
        ...query,
        includeApplied: true,
      });
      expect(included.data).toHaveLength(1);
    });

    it('does not read interests when the student opted out', async () => {
      profileModel.findOne.mockReturnValue(
        chain({ interests: ['stellar'], matchingOptedOut: true, rejectedInterests: [] }),
      );

      const result = await service.recommendations('student-1', query);

      expect(result.personalization).toEqual({
        coldStart: true,
        optedOut: true,
        interestCount: 0,
        dismissedCount: 0,
      });
      expect(result.data[0].reasons.some((r: { code: string }) => r.code === 'interest_overlap')).toBe(
        false,
      );
    });

    it('never returns the student’s own identifiers or attestations', async () => {
      const result = await service.recommendations('student-1', query);

      for (const match of result.data) {
        expect(match).not.toHaveProperty('studentId');
        expect(match).not.toHaveProperty('attestations');
        expect(match).not.toHaveProperty('dismissals');
      }
    });

    it('caps the page size at 50 even if a larger limit is requested', async () => {
      const result = await service.recommendations('student-1', { ...query, limit: 5000 });
      expect(result.limit).toBe(50);
    });

    it('reports totals for the whole ranked set, not the page', async () => {
      programModel.find.mockReturnValue(
        chain(
          Array.from({ length: 12 }, (_, i) =>
            makeProgram({
              _id: `507f1f77bcf86cd7994390${String(i).padStart(2, '0')}`,
              title: `Stellar award ${i}`,
            }),
          ),
        ),
      );

      const result = await service.recommendations('student-1', { ...query, limit: 5 });

      expect(result.data).toHaveLength(5);
      expect(result.total).toBe(12);
      expect(result.totalPages).toBe(3);
    });

    it('treats a program with no rules as open to everyone', async () => {
      // ruleModel.find returns [] by default: the student is eligible, so the
      // verified-eligibility reason is awarded without any attestation.
      const result = await service.recommendations('student-1', query);
      expect(result.data[0].reasons.some((r: { code: string }) => r.code === 'verified_eligibility')).toBe(
        true,
      );
    });

    it('does not award verified eligibility when a required rule is unmet', async () => {
      ruleModel.find.mockReturnValue(
        chain([
          {
            programId,
            ruleType: EligibilityRuleType.MIN_GPA,
            operator: 'and',
            isRequired: true,
            parameters: { minGpa: 3.5 },
          },
        ]),
      );

      const result = await service.recommendations('student-1', query);

      expect(
        result.data.some((m: { reasons: Array<{ code: string }> }) =>
          m.reasons.some((r) => r.code === 'verified_eligibility'),
        ),
      ).toBe(false);
    });
  });
});
