import { Role } from '../../common/enums/role.enum';
import { ErrorCode } from '../../common/errors';
import { MentorshipRequestContext } from '../shared/mentorship-context';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { CapacityAccessPolicy } from './capacity-access.policy';
import { CapacityScope } from './capacity.constants';
import { CapacityService } from './capacity.service';
import {
  DefineCapacityPolicyDto,
  ReserveCapacityDto,
} from './dto/capacity.dto';

const MENTOR = 'm'.repeat(24);
const PROPOSAL = 'p'.repeat(24);
const PROGRAM = 'g'.repeat(24);

const ctx = (role: Role, id: string): MentorshipRequestContext => ({
  user: { id, email: `${id}@example.com`, role },
});
const ADMIN = ctx(Role.ADMIN, 'admin-001');
const TUTOR = ctx(Role.TUTOR, MENTOR);
const STUDENT = ctx(Role.STUDENT, 's'.repeat(24));

function applyUpdate(row: any, update: any): void {
  if (update.$inc) {
    for (const [key, value] of Object.entries(update.$inc)) {
      row[key] = (row[key] ?? 0) + (value as number);
    }
  }
  if (update.$set) Object.assign(row, update.$set);
}

function build() {
  const policies: any[] = [];
  const allocations: any[] = [];
  const reservations: any[] = [];
  let seq = 1;

  const query = (result: () => unknown) => {
    const q: any = {
      sort: () => q,
      limit: () => q,
      lean: () => q,
      exec: async () => result(),
    };
    return q;
  };

  const policyModel: any = {
    findOne: jest.fn((filter: any) =>
      query(() =>
        policies
          .filter((p) => p.scopeKey === filter.scopeKey)
          .sort((a, b) => b.version - a.version)[0] ?? null,
      ),
    ),
    create: jest.fn(async (doc: any) => {
      const row = { _id: String(seq++), ...doc, createdAt: new Date() };
      policies.push(row);
      return row;
    }),
  };

  const allocationModel: any = {
    findOne: jest.fn((filter: any) =>
      query(
        () =>
          allocations.find(
            (a) => a.mentorId === filter.mentorId && a.scopeKey === filter.scopeKey,
          ) ?? null,
      ),
    ),
    findOneAndUpdate: jest.fn(async (filter: any, update: any) => {
      const row = allocations.find((a) => String(a._id) === String(filter._id));
      if (!row || row.version !== filter.version) return null;
      applyUpdate(row, update);
      return row;
    }),
    create: jest.fn(async (doc: any) => {
      const row = { _id: String(seq++), ...doc };
      allocations.push(row);
      return row;
    }),
    updateOne: jest.fn(async (filter: any, update: any) => {
      const row = allocations.find(
        (a) => a.mentorId === filter.mentorId && a.scopeKey === filter.scopeKey,
      );
      if (!row || row.reservedProposals <= 0) return { modifiedCount: 0 };
      applyUpdate(row, update);
      return { modifiedCount: 1 };
    }),
  };

  const reservationModel: any = {
    findOne: jest.fn((filter: any) =>
      query(
        () =>
          reservations.find(
            (r) => r.mentorId === filter.mentorId && r.proposalId === filter.proposalId,
          ) ?? null,
      ),
    ),
    find: jest.fn((filter: any) =>
      query(() =>
        reservations.filter(
          (r) => r.status === filter.status && r.expiresAt <= filter.expiresAt.$lte,
        ),
      ),
    ),
    findOneAndUpdate: jest.fn(async (filter: any, update: any, opts: any) => {
      let row = reservations.find(
        (r) => r.mentorId === filter.mentorId && r.proposalId === filter.proposalId,
      );
      if (!row) {
        if (!opts?.upsert) return null;
        row = {
          _id: String(seq++),
          mentorId: filter.mentorId,
          proposalId: filter.proposalId,
          ...update.$setOnInsert,
        };
        reservations.push(row);
        return row;
      }
      if (filter._id && String(row._id) !== String(filter._id)) return null;
      if (filter.status && row.status !== filter.status) return null;
      applyUpdate(row, update);
      return row;
    }),
  };

  const telemetry = {
    count: jest.fn(),
    event: jest.fn(),
    warn: jest.fn(),
  } as unknown as MentorshipTelemetry;
  const service = new CapacityService(
    policyModel,
    allocationModel,
    reservationModel,
    new CapacityAccessPolicy(telemetry),
    telemetry,
  );
  return {
    service,
    policies,
    allocations,
    reservations,
    policyModel,
    allocationModel,
    reservationModel,
    telemetry,
  };
}

const policyDto = (over: Record<string, unknown> = {}): DefineCapacityPolicyDto =>
  ({
    scope: CapacityScope.GLOBAL,
    maxConcurrentEngagements: 3,
    maxWeeklyHours: 10,
    maxPrograms: 2,
    maxCohortsPerProgram: 2,
    reservedProposalCapacity: 2,
    expectedVersion: 0,
    ...over,
  }) as DefineCapacityPolicyDto;

const reserveDto = (over: Record<string, unknown> = {}): ReserveCapacityDto =>
  ({
    proposalId: PROPOSAL,
    mentorId: MENTOR,
    programId: PROGRAM,
    cohortId: 'cohort-1',
    weeklyHours: 2,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    idempotencyKey: 'reserve-key-01',
    ...over,
  }) as ReserveCapacityDto;

describe('CapacityService (MENTOR-041)', () => {
  describe('policy definition', () => {
    it('publishes version 1 for staff', async () => {
      const { service, policies } = build();
      const view = await service.definePolicy(ADMIN, policyDto());
      expect(view.version).toBe(1);
      expect(policies).toHaveLength(1);
    });

    it('is idempotent for identical content', async () => {
      const { service, policies } = build();
      await service.definePolicy(ADMIN, policyDto());
      const again = await service.definePolicy(ADMIN, policyDto());
      expect(again.version).toBe(1);
      expect(policies).toHaveLength(1);
    });

    it('publishes a new version when pause state changes', async () => {
      const { service, policies } = build();
      await service.definePolicy(ADMIN, policyDto());
      const paused = await service.definePolicy(
        ADMIN,
        policyDto({ paused: true, pauseReason: 'incident', expectedVersion: 1 }),
      );
      expect(paused.version).toBe(2);
      expect(paused.pause.active).toBe(true);
      expect(policies).toHaveLength(2);
    });

    it('rejects a stale expectedVersion', async () => {
      const { service } = build();
      await service.definePolicy(ADMIN, policyDto());
      await expect(
        service.definePolicy(ADMIN, policyDto({ maxConcurrentEngagements: 4, expectedVersion: 0 })),
      ).rejects.toMatchObject({ errorCode: ErrorCode.MENTOR_STALE_VERSION });
    });

    it('denies non-staff callers', async () => {
      const { service, policies } = build();
      await expect(service.definePolicy(STUDENT, policyDto())).rejects.toMatchObject({
        errorCode: ErrorCode.MENTOR_ACCESS_DENIED,
      });
      expect(policies).toHaveLength(0);
    });
  });

  describe('inspection', () => {
    it('returns a read-only calculation for staff without writing state', async () => {
      const { service, allocations } = build();
      await service.definePolicy(ADMIN, policyDto());
      const view = await service.inspectAllocation(ADMIN, MENTOR, {});
      expect(view.calculation.canAcceptOneMore).toBe(true);
      expect(view.usage.reservedProposals).toBe(0);
      expect(allocations).toHaveLength(0);
    });

    it('denies non-staff inspection', async () => {
      const { service } = build();
      await service.definePolicy(ADMIN, policyDto());
      await expect(service.inspectAllocation(STUDENT, MENTOR, {})).rejects.toMatchObject({
        errorCode: ErrorCode.MENTOR_ACCESS_DENIED,
      });
    });
  });

  describe('reservations', () => {
    it('reserves a slot for the mentor and is idempotent on retry', async () => {
      const { service, allocations, reservations } = build();
      await service.definePolicy(ADMIN, policyDto());
      const first = await service.reserveCapacity(TUTOR, reserveDto());
      expect(first.status).toBe('active');
      expect(allocations[0].reservedProposals).toBe(1);
      expect(allocations[0].weeklyHours).toBe(2);
      await service.reserveCapacity(TUTOR, reserveDto());
      expect(reservations).toHaveLength(1);
      expect(allocations[0].reservedProposals).toBe(1);
    });

    it('denies a tutor reserving for another mentor', async () => {
      const { service } = build();
      await service.definePolicy(ADMIN, policyDto());
      await expect(
        service.reserveCapacity(TUTOR, reserveDto({ mentorId: 'x'.repeat(24) })),
      ).rejects.toMatchObject({ errorCode: ErrorCode.MENTOR_ACCESS_DENIED });
    });

    it('blocks a reservation when capacity is exhausted', async () => {
      const { service, reservations } = build();
      await service.definePolicy(
        ADMIN,
        policyDto({ maxConcurrentEngagements: 1, reservedProposalCapacity: 1 }),
      );
      await service.reserveCapacity(TUTOR, reserveDto());
      await expect(
        service.reserveCapacity(TUTOR, reserveDto({ proposalId: 'a'.repeat(24) })),
      ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_MENTORSHIP_CAPACITY_EXHAUSTED });
      expect(reservations).toHaveLength(1);
    });

    it('blocks a reservation when the scope is paused', async () => {
      const { service } = build();
      await service.definePolicy(ADMIN, policyDto({ paused: true, pauseReason: 'review' }));
      await expect(service.reserveCapacity(TUTOR, reserveDto())).rejects.toMatchObject({
        errorCode: ErrorCode.BIZ_MENTORSHIP_CAPACITY_EXHAUSTED,
      });
    });

    it('ignores a pause whose expiry has passed', async () => {
      const { service } = build();
      await service.definePolicy(
        ADMIN,
        policyDto({
          paused: true,
          pauseReason: 'review',
          pauseExpiresAt: new Date(Date.now() - 1000).toISOString(),
          expectedVersion: 0,
        }),
      );
      await expect(service.reserveCapacity(TUTOR, reserveDto())).resolves.toMatchObject({
        status: 'active',
      });
    });

    it('rejects an expired or too-distant expiry', async () => {
      const { service } = build();
      await service.definePolicy(ADMIN, policyDto());
      await expect(
        service.reserveCapacity(TUTOR, reserveDto({ expiresAt: new Date(Date.now() - 1000).toISOString() })),
      ).rejects.toMatchObject({ errorCode: ErrorCode.VAL_RESERVATION_INVALID_EXPIRY });
    });

    it('releases idempotently without going negative', async () => {
      const { service, allocations } = build();
      await service.definePolicy(ADMIN, policyDto());
      await service.reserveCapacity(TUTOR, reserveDto());
      await service.releaseCapacity(TUTOR, MENTOR, PROPOSAL);
      expect(allocations[0].reservedProposals).toBe(0);
      expect(allocations[0].weeklyHours).toBe(0);
      await service.releaseCapacity(TUTOR, MENTOR, PROPOSAL);
      expect(allocations[0].reservedProposals).toBe(0);
    });
  });

  describe('expiry sweeper', () => {
    it('expires a stale reservation once and releases its slot', async () => {
      const { service, reservations, allocations } = build();
      await service.definePolicy(ADMIN, policyDto());
      await service.reserveCapacity(TUTOR, reserveDto());
      reservations[0].expiresAt = new Date(Date.now() - 1000);
      const first = await service.expireReservations({ limit: 10 });
      expect(first).toEqual({ scanned: 1, expired: 1 });
      expect(reservations[0].status).toBe('expired');
      expect(allocations[0].reservedProposals).toBe(0);
      const second = await service.expireReservations({ limit: 10 });
      expect(second.expired).toBe(0);
    });
  });
});
