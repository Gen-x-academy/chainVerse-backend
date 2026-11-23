import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';
import { ErrorCode, ForbiddenDomainException } from '../../common/errors';
import {
  ActivateAmendmentDto,
  ApproveAmendmentDto,
  PreviewAmendmentDto,
  ProposeAmendmentDto,
  RejectAmendmentDto,
} from './dto/agreement-amendment.dto';
import {
  AgreementAmendmentService,
  AmendmentActor,
} from './agreement-amendment.service';
import { AmendmentStatus, computeAmendmentHash } from './schemas/agreement-amendment.schema';

const AGREEMENT_ID = new Types.ObjectId().toString();
const ALICE = 'mentor-alice';
const BOB = 'student-bob';
const CAROL = 'outsider-carol';

const admin: AmendmentActor = { id: 'admin-1', role: Role.ADMIN };
const alice: AmendmentActor = { id: ALICE, role: Role.TUTOR };
const bob: AmendmentActor = { id: BOB, role: Role.STUDENT };
const carol: AmendmentActor = { id: CAROL, role: Role.STUDENT };

const currentTerms = { cadence: 'weekly', price: 100, scope: 'backend' };
const changes = { price: 150 };

function getPath(row: Record<string, any>, path: string): unknown {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), row);
}

function matches(row: Record<string, any>, filter: Record<string, any>): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === 'approvals.approverId') {
      const ids = (row.approvals ?? []).map((a: { approverId: string }) => a.approverId);
      if (condition && typeof condition === 'object' && '$ne' in condition) {
        return !ids.includes(condition.$ne);
      }
      return ids.includes(condition);
    }
    const actual = getPath(row, key);
    if (condition && typeof condition === 'object' && '$ne' in condition) {
      return actual !== condition.$ne;
    }
    return actual === condition;
  });
}

function applyUpdate(row: Record<string, any>, update: Record<string, any>): void {
  if (update.$set) Object.assign(row, update.$set);
  if (update.$push) {
    for (const [key, value] of Object.entries(update.$push)) {
      row[key] = [...(row[key] ?? []), value];
    }
  }
}

/** Minimal in-memory stand-in for the Mongoose model (no database required). */
class FakeAmendments {
  rows: Record<string, any>[] = [];
  failNextCreate = false;

  private query(filter: Record<string, any>, all: boolean) {
    const chain: any = {
      sortOrder: null as Record<string, number> | null,
      sort(order: Record<string, number>) {
        this.sortOrder = order;
        return this;
      },
      exec: async () => {
        let result = this.rows.filter((row) => matches(row, filter));
        if (chain.sortOrder) {
          const [key, direction] = Object.entries(chain.sortOrder)[0] as [string, number];
          result = [...result].sort((a, b) => (a[key] - b[key]) * direction);
        }
        return all ? result : result[0] ?? null;
      },
    };
    return chain;
  }

  findOne = (filter: Record<string, any>) => this.query(filter, false);
  find = (filter: Record<string, any>) => this.query(filter, true);
  findById = (id: unknown) => ({
    exec: async () =>
      this.rows.find((row) => String(row._id) === String(id)) ?? null,
  });

  create = async (doc: Record<string, any>) => {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    }
    const row = { _id: new Types.ObjectId(), createdAt: new Date(), ...doc };
    this.rows.push(row);
    return row;
  };

  findOneAndUpdate = (
    filter: Record<string, any>,
    update: Record<string, any>,
  ) => ({
    exec: async () => {
      const row = this.rows.find((candidate) => matches(candidate, filter));
      if (!row) return null;
      applyUpdate(row, update);
      return row;
    },
  });

  updateOne = (filter: Record<string, any>, update: Record<string, any>) => ({
    exec: async () => {
      const row = this.rows.find((candidate) => matches(candidate, filter));
      if (!row) return { modifiedCount: 0 };
      applyUpdate(row, update);
      return { modifiedCount: 1 };
    },
  });
}

function setup() {
  const amendments = new FakeAmendments();
  const telemetry = { count: jest.fn() };
  const service = new AgreementAmendmentService(amendments as never, telemetry as never);
  return { service, amendments, telemetry };
}

function proposeDto(overrides: Partial<ProposeAmendmentDto> = {}) {
  return plainToInstance(ProposeAmendmentDto, {
    version: 2,
    supersedes: 1,
    participantIds: [ALICE, BOB],
    currentTerms,
    changes,
    ...overrides,
  });
}

function approvalDto(): ApproveAmendmentDto {
  return plainToInstance(ApproveAmendmentDto, { note: 'Looks good' });
}

describe('Agreement amendment DTO validation', () => {
  it('accepts a valid proposal', async () => {
    await expect(validate(proposeDto())).resolves.toEqual([]);
  });

  it.each([
    ['a version not greater than supersedes', { version: 1 }],
    ['an empty participants list', { participantIds: [] }],
    ['a primitive changes value', { changes: 'bad' }],
    ['a primitive currentTerms value', { currentTerms: [] }],
  ])('rejects %s', async (_label, override) => {
    expect((await validate(proposeDto(override))).length).toBeGreaterThan(0);
  });

  it('rejects an empty rejection reason', async () => {
    const dto = plainToInstance(RejectAmendmentDto, { reason: '' });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});

describe('AgreementAmendmentService preview and propose', () => {
  it('previews a material price change without writing', async () => {
    const { service, amendments } = setup();
    const dto = plainToInstance(PreviewAmendmentDto, {
      currentTerms,
      changes,
      participantIds: [ALICE, BOB],
    });

    const result = service.preview(alice, dto);

    expect(result.impact.priceChanged).toBe(true);
    expect(result.impact.priceDelta).toBe(50);
    expect(result.impact.requiresReapproval).toBe(true);
    expect(result.termsHash).toBe(computeAmendmentHash(currentTerms, changes));
    expect(amendments.rows).toHaveLength(0);
  });

  it('lets a participant propose and is idempotent on replay', async () => {
    const { service, amendments } = setup();
    const first = await service.propose(alice, AGREEMENT_ID, proposeDto());
    const again = await service.propose(alice, AGREEMENT_ID, proposeDto());

    expect(String(again._id)).toBe(String(first._id));
    expect(amendments.rows).toHaveLength(1);
    expect(first.status).toBe(AmendmentStatus.PROPOSED);
    expect(first.requiredApprovers).toEqual([BOB]);
  });

  it('denies an outsider (deny by default)', async () => {
    const { service } = setup();

    await expect(
      service.propose(carol, AGREEMENT_ID, proposeDto()),
    ).rejects.toMatchObject({ errorCode: ErrorCode.MENTOR_ACCESS_DENIED });
  });

  it('rejects a version conflict for the same version with different content', async () => {
    const { service } = setup();
    await service.propose(alice, AGREEMENT_ID, proposeDto());

    await expect(
      service.propose(
        alice,
        AGREEMENT_ID,
        proposeDto({ changes: { scope: 'frontend' } }),
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_DUPLICATE_REQUEST });
  });
});

describe('AgreementAmendmentService approval and rejection', () => {
  async function proposed() {
    const ctx = setup();
    const amendment = await ctx.service.propose(alice, AGREEMENT_ID, proposeDto());
    return { ...ctx, amendment };
  }

  it('rejects self-approval by the proposer', async () => {
    const { service, amendment } = await proposed();

    await expect(
      service.approve(alice, String(amendment._id), approvalDto()),
    ).rejects.toMatchObject({ errorCode: ErrorCode.MENTOR_ACCESS_DENIED });
  });

  it('becomes APPROVED only after every required approver signs', async () => {
    const { service, amendment } = await proposed();

    const afterBob = await service.approve(bob, String(amendment._id), approvalDto());
    expect(afterBob.status).toBe(AmendmentStatus.APPROVED);
    expect(afterBob.approvals).toHaveLength(1);
  });

  it('double approval is idempotent', async () => {
    const { service, amendment } = await proposed();

    await service.approve(bob, String(amendment._id), approvalDto());
    const again = await service.approve(bob, String(amendment._id), approvalDto());

    expect(again.approvals).toHaveLength(1);
  });

  it('rejecting leaves any active agreement intact', async () => {
    const ctx = setup();
    await ctx.amendments.create({
      _id: new Types.ObjectId(),
      agreementId: AGREEMENT_ID,
      version: 1,
      supersedes: 0,
      proposedBy: admin.id,
      participantIds: [ALICE, BOB],
      changes: {},
      termsHash: 'original',
      impact: { requiresReapproval: false },
      requiredApprovers: [],
      approvals: [],
      status: AmendmentStatus.ACTIVE,
    });
    const pending = await ctx.service.propose(alice, AGREEMENT_ID, proposeDto());

    const rejected = await ctx.service.reject(
      bob,
      String(pending._id),
      plainToInstance(RejectAmendmentDto, { reason: 'Not this term' }),
    );
    const active = await ctx.service.activeFor(AGREEMENT_ID);

    expect(rejected.status).toBe(AmendmentStatus.REJECTED);
    expect(active?.version).toBe(1);
  });
});

describe('AgreementAmendmentService activation', () => {
  it('keeps old terms in force until the approved amendment is activated', async () => {
    const ctx = setup();
    await ctx.amendments.create({
      _id: new Types.ObjectId(),
      agreementId: AGREEMENT_ID,
      version: 1,
      supersedes: 0,
      proposedBy: admin.id,
      participantIds: [ALICE, BOB],
      changes: {},
      termsHash: 'original',
      impact: { requiresReapproval: false },
      requiredApprovers: [],
      approvals: [],
      status: AmendmentStatus.ACTIVE,
    });
    const amendment = await ctx.service.propose(alice, AGREEMENT_ID, proposeDto());
    await ctx.service.approve(bob, String(amendment._id), approvalDto());

    expect((await ctx.service.activeFor(AGREEMENT_ID))?.version).toBe(1);

    const active = await ctx.service.activate(
      admin,
      String(amendment._id),
      plainToInstance(ActivateAmendmentDto, { note: 'go live' }),
    );

    expect(active.status).toBe(AmendmentStatus.ACTIVE);
    expect((await ctx.service.activeFor(AGREEMENT_ID))?.version).toBe(2);
  });

  it('cannot activate an amendment that was never approved', async () => {
    const { service } = setup();
    const pending = await service.propose(alice, AGREEMENT_ID, proposeDto());

    await expect(
      service.activate(
        admin,
        String(pending._id),
        plainToInstance(ActivateAmendmentDto, {}),
      ),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
  });
});
