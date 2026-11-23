import { Role } from '../../common/enums/role.enum';
import { ErrorCode } from '../../common/errors';
import { MentorshipRequestContext } from '../shared/mentorship-context';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { ConflictAccessPolicy } from './conflict-access.policy';
import { ConflictSeverity } from './conflict.constants';
import { ConflictService } from './conflict.service';
import {
  DecideWaiverDto,
  RequestWaiverDto,
  RunConflictCheckDto,
} from './dto/conflict.dto';

const PROPOSAL = 'p'.repeat(24);
const MENTOR = 'm'.repeat(24);
const MENTEE = 'st'.repeat(12);
const CHECK_ID = 'c'.repeat(24);

const ctx = (role: Role, id: string): MentorshipRequestContext => ({
  user: { id, email: `${id}@example.com`, role },
});
const TUTOR = ctx(Role.TUTOR, MENTOR);
const STUDENT = ctx(Role.STUDENT, MENTEE);
const ADMIN = ctx(Role.ADMIN, 'admin-001');
const OTHER_ADMIN = ctx(Role.ADMIN, 'admin-002');
const OUTSIDER = ctx(Role.STUDENT, 'other-student');

function matches(row: any, filter: any): boolean {
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

function build() {
  const checks: any[] = [];
  const waivers: any[] = [];
  let seq = 1;

  const query = (result: () => unknown) => {
    const q: any = {
      sort: () => q,
      lean: () => q,
      exec: async () => result(),
    };
    return q;
  };

  const checkModel: any = {
    findOne: jest.fn((filter: any) =>
      query(
        () =>
          checks.filter((c) => matches(c, filter)).sort((a, b) => b.checkVersion - a.checkVersion)[0] ?? null,
      ),
    ),
    findById: jest.fn((id: string) =>
      query(() => checks.find((c) => String(c._id) === String(id)) ?? null),
    ),
    create: jest.fn(async (doc: any) => {
      const row = { _id: String(seq++), ...doc, createdAt: new Date() };
      checks.push(row);
      return row;
    }),
  };

  const waiverModel: any = {
    findOne: jest.fn((filter: any) =>
      query(
        () =>
          waivers.filter((w) => matches(w, filter)).sort((a, b) => b.version - a.version)[0] ?? null,
      ),
    ),
    find: jest.fn((filter: any) =>
      query(() =>
        waivers.filter(
          (w) => w.status === filter.status && filter.findingCode.$in.includes(w.findingCode),
        ),
      ),
    ),
    create: jest.fn(async (doc: any) => {
      const row = { _id: String(seq++), ...doc, createdAt: new Date() };
      waivers.push(row);
      return row;
    }),
  };

  const telemetry = {
    count: jest.fn(),
    event: jest.fn(),
    warn: jest.fn(),
  } as unknown as MentorshipTelemetry;
  const service = new ConflictService(
    checkModel,
    waiverModel,
    new ConflictAccessPolicy(telemetry),
    telemetry,
  );
  return { service, checks, waivers, checkModel, waiverModel, telemetry };
}

const checkDto = (
  facts: Record<string, unknown> = {},
  over: Record<string, unknown> = {},
): RunConflictCheckDto =>
  ({
    proposalId: PROPOSAL,
    mentorId: MENTOR,
    menteeId: MENTEE,
    facts,
    idempotencyKey: 'check-key-01',
    ...over,
  }) as RunConflictCheckDto;

const requestDto = (over: Record<string, unknown> = {}): RequestWaiverDto =>
  ({
    checkId: CHECK_ID,
    findingCode: 'REPORTING_LINE',
    reason: 'Reporting line was formally ended.',
    idempotencyKey: 'waiver-key-01',
    ...over,
  }) as RequestWaiverDto;

const decisionDto = (over: Record<string, unknown> = {}): DecideWaiverDto =>
  ({ decision: 'approve', expectedVersion: 1, ...over }) as DecideWaiverDto;

describe('ConflictService (MENTOR-040)', () => {
  describe('checks', () => {
    it('records a hard check and is idempotent on retry', async () => {
      const { service, checks } = build();
      const first = await service.runCheck(TUTOR, checkDto({ reportingRelationship: true }));
      expect(first.outcome).toBe('hard');
      expect(first.findings).toHaveLength(1);
      const second = await service.runCheck(TUTOR, checkDto({ reportingRelationship: true }));
      expect(second.id).toBe(first.id);
      expect(checks).toHaveLength(1);
    });

    it('denies unrelated callers', async () => {
      const { service, checks } = build();
      await expect(service.runCheck(OUTSIDER, checkDto())).rejects.toMatchObject({
        errorCode: ErrorCode.MENTOR_ACCESS_DENIED,
      });
      expect(checks).toHaveLength(0);
    });

    it('exposes private declared notes only to staff', async () => {
      const { service } = build();
      const facts = {
        declaredRelationships: [
          { kind: 'family', severity: ConflictSeverity.HARD, note: 'Private detail' },
        ],
      };
      const staffView = await service.runCheck(ADMIN, checkDto(facts));
      expect(staffView.privateNotes).toContain('Private detail');
      const participantView = await service.runCheck(TUTOR, checkDto(facts));
      expect(participantView).not.toHaveProperty('privateNotes');
      expect(JSON.stringify(participantView.findings)).not.toContain('Private detail');
    });

    it('explains a check only to staff or participants', async () => {
      const { service } = build();
      const created = await service.runCheck(TUTOR, checkDto({ reportingRelationship: true }));
      const participant = await service.explain(STUDENT, created.id);
      expect(participant).not.toHaveProperty('privateNotes');
      expect(participant.explanation[0].toLowerCase()).toContain('reporting relationship');
      const staff = await service.explain(ADMIN, created.id);
      expect(staff.explanation).toHaveLength(1);
      await expect(service.explain(OUTSIDER, created.id)).rejects.toMatchObject({
        errorCode: ErrorCode.MENTOR_ACCESS_DENIED,
      });
    });

    it('returns not found for an unknown check', async () => {
      const { service } = build();
      await expect(service.explain(ADMIN, 'z'.repeat(24))).rejects.toMatchObject({
        errorCode: ErrorCode.RES_NOT_FOUND,
      });
    });
  });

  describe('activation gate', () => {
    it('requires a check before activation', async () => {
      const { service } = build();
      await expect(service.assertActivatable(ADMIN, PROPOSAL)).rejects.toMatchObject({
        errorCode: ErrorCode.MENTOR_COI_DECLARATION_REQUIRED,
      });
    });

    it('blocks activation for an unwaived hard conflict', async () => {
      const { service } = build();
      await service.runCheck(TUTOR, checkDto({ reportingRelationship: true }));
      await expect(service.assertActivatable(ADMIN, PROPOSAL)).rejects.toMatchObject({
        errorCode: ErrorCode.MENTOR_CONFLICT_OF_INTEREST,
      });
    });

    it('allows activation when there is no hard finding', async () => {
      const { service } = build();
      await service.runCheck(TUTOR, checkDto({ sharedOrganizationId: 'org-1' }));
      await expect(service.assertActivatable(ADMIN, PROPOSAL)).resolves.toMatchObject({
        activatable: true,
      });
    });

    it('allows activation once the hard finding is separately waived', async () => {
      const { service, checks } = build();
      await service.runCheck(TUTOR, checkDto({ reportingRelationship: true }));
      const request = await service.requestWaiver(ADMIN, requestDto({ checkId: checks[0]._id }));
      expect(request.version).toBe(1);
      expect(request).not.toHaveProperty('reason');
      await service.decideWaiver(
        OTHER_ADMIN,
        PROPOSAL,
        'REPORTING_LINE',
        decisionDto({ expectedVersion: 1 }),
      );
      await expect(service.assertActivatable(ADMIN, PROPOSAL)).resolves.toMatchObject({
        activatable: true,
        waivedCodes: ['REPORTING_LINE'],
      });
    });
  });

  describe('waivers', () => {
    it('is idempotent for repeated requests', async () => {
      const { service, checks, waivers } = build();
      await service.runCheck(TUTOR, checkDto({ reportingRelationship: true }));
      const dto = requestDto({ checkId: checks[0]._id });
      const first = await service.requestWaiver(TUTOR, dto);
      const second = await service.requestWaiver(TUTOR, dto);
      expect(second.id).toBe(first.id);
      expect(waivers).toHaveLength(1);
    });

    it('rejects waivers for potential findings', async () => {
      const { service, checks } = build();
      await service.runCheck(TUTOR, checkDto({ sharedOrganizationId: 'org-1' }));
      await expect(
        service.requestWaiver(TUTOR, requestDto({ checkId: checks[0]._id, findingCode: 'ORG_SAME' })),
      ).rejects.toMatchObject({ errorCode: ErrorCode.VAL_INVALID_INPUT });
    });

    it('denies self-approval and stale versions', async () => {
      const { service, checks } = build();
      await service.runCheck(TUTOR, checkDto({ reportingRelationship: true }));
      await service.requestWaiver(ADMIN, requestDto({ checkId: checks[0]._id }));
      await expect(
        service.decideWaiver(ADMIN, PROPOSAL, 'REPORTING_LINE', decisionDto()),
      ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_SEPARATION_OF_DUTIES });
      await expect(
        service.decideWaiver(OTHER_ADMIN, PROPOSAL, 'REPORTING_LINE', decisionDto({ expectedVersion: 5 })),
      ).rejects.toMatchObject({ errorCode: ErrorCode.MENTOR_STALE_VERSION });
      await expect(
        service.decideWaiver(STUDENT, PROPOSAL, 'REPORTING_LINE', decisionDto()),
      ).rejects.toMatchObject({ errorCode: ErrorCode.MENTOR_ACCESS_DENIED });
    });

    it('appends a decision without mutating the request', async () => {
      const { service, checks, waivers } = build();
      await service.runCheck(TUTOR, checkDto({ reportingRelationship: true }));
      await service.requestWaiver(ADMIN, requestDto({ checkId: checks[0]._id }));
      const decided = await service.decideWaiver(
        OTHER_ADMIN,
        PROPOSAL,
        'REPORTING_LINE',
        decisionDto({ decisionNote: 'Reviewed by compliance' }),
      );
      expect(decided.version).toBe(2);
      expect(decided.status).toBe('approved');
      expect(waivers).toHaveLength(2);
      expect(waivers[0].status).toBe('requested');
      expect(decided.reason).toBe('Reporting line was formally ended.');
    });
  });
});
