import { ErrorCode } from '../common/errors/error-codes.enum';
import {
  BudgetCategory,
  FundingModel,
  ProjectFundingRole,
  ReleaseConditionType,
} from './entities';
import { ProjectFundingAuditService } from './project-funding-audit.service';
import { ProjectFundingRepository } from './project-funding.repository';
import { ProjectFundingService } from './project-funding.service';
import {
  actor,
  FUTURE,
  intentDto,
  modelDto,
  planDto,
  reservationDto,
} from './project-funding.fixtures';

describe('ProjectFundingService', () => {
  let service: ProjectFundingService;
  let repository: ProjectFundingRepository;
  let audit: ProjectFundingAuditService;

  beforeEach(() => {
    repository = new ProjectFundingRepository();
    audit = new ProjectFundingAuditService();
    service = new ProjectFundingService(repository, audit);
  });

  const seed = async () => {
    await service.configureFundingModel(modelDto(), actor());
    await service.createBudgetPlan(planDto(), actor());
  };

  const expectCode = async (promise: Promise<unknown>, code: ErrorCode) => {
    await expect(promise).rejects.toMatchObject({ errorCode: code });
  };

  it('configures a funding model with asset, payer, recipients and fees', async () => {
    const result = await service.configureFundingModel(
      modelDto({
        model: FundingModel.SPONSOR_FUNDED,
        asset: {
          code: 'USDC',
          issuer: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW',
        },
      }),
      actor(ProjectFundingRole.SPONSOR),
    );

    expect(result.id).toBe('model-project-1');
    expect(result.asset.code).toBe('USDC');
    expect(result.payerId).toBe('member-1');
    expect(result.fees).toEqual({ platformBps: 0, flat: 0 });
    expect(result.pool.capMinor).toBe(1000000);
    expect(result.replayed).toBe(false);
  });

  it('rejects invalid funding model domain rules', async () => {
    await expectCode(
      service.configureFundingModel(
        modelDto({ asset: { code: 'USDC' } }),
        actor(),
      ),
      ErrorCode.VAL_INVALID_INPUT,
    );
    await expectCode(
      service.configureFundingModel(
        modelDto({ model: FundingModel.UNFUNDED }),
        actor(),
      ),
      ErrorCode.BIZ_INVALID_STATE_TRANSITION,
    );
    await expectCode(
      service.configureFundingModel(
        modelDto({ recipients: [{ memberId: 'member-2', shareBps: 9999 }] }),
        actor(),
      ),
      ErrorCode.VAL_INVALID_INPUT,
    );
    await expectCode(
      service.configureFundingModel(
        modelDto({ fees: { platformBps: 1000, flat: 950000 } }),
        actor(),
      ),
      ErrorCode.BIZ_FEE_EXCEEDS_AMOUNT,
    );
  });

  it('requires a configured model before creating a budget plan', async () => {
    await expectCode(
      service.createBudgetPlan(planDto(), actor()),
      ErrorCode.RES_NOT_FOUND,
    );
  });

  it('creates a versioned budget plan with computed totals and no private justification in the response', async () => {
    await service.configureFundingModel(modelDto(), actor());
    const result = await service.createBudgetPlan(planDto(), actor());

    expect(result.planId).toBe('plan-project-1');
    expect(result.totalMinor).toBe(600000);
    expect(result.byCategory[BudgetCategory.EQUIPMENT]).toBe(600000);
    expect(result.lines[0]).not.toHaveProperty('justification');
    expect(result.version).toBe(1);
    expect(result.revision).toBe(1);
  });

  it('enforces approval thresholds with separation of duties', async () => {
    await service.configureFundingModel(modelDto(), actor());
    const overThreshold = planDto({ approvalThresholdMinor: 100000 });

    await expectCode(
      service.createBudgetPlan(overThreshold, actor()),
      ErrorCode.BIZ_OVERRIDE_REQUIRES_APPROVAL,
    );
    await expectCode(
      service.createBudgetPlan(
        {
          ...overThreshold,
          approverId: 'actor-admin',
          approverRole: ProjectFundingRole.ADMIN,
        },
        actor(),
      ),
      ErrorCode.BIZ_OVERRIDE_REQUIRES_APPROVAL,
    );

    const approved = await service.createBudgetPlan(
      {
        ...overThreshold,
        approverId: 'member-finance',
        approverRole: ProjectFundingRole.FINANCE,
      },
      actor(),
    );
    expect(approved.planId).toBe('plan-project-1');
  });

  it('rejects stale revisions', async () => {
    await seed();
    await expectCode(
      service.createBudgetPlan(
        planDto({ expectedRevision: 5, requestId: 'stale-plan' }),
        actor(),
      ),
      ErrorCode.BIZ_DUPLICATE_REQUEST,
    );
    await expectCode(
      service.reserveBudget(reservationDto({ expectedRevision: 8 }), actor()),
      ErrorCode.BIZ_DUPLICATE_REQUEST,
    );
  });

  it('reserves an approved budget within cap, currency and expiry rules', async () => {
    await seed();
    const result = await service.reserveBudget(reservationDto(), actor());

    expect(result.reservationId).toBe('reservation-reservation-request-1');
    expect(result.amountMinor).toBe(250000);
    expect(result.currency).toBe('XLM');
    expect(repository.listReservations('tenant-alpha')).toHaveLength(1);
    expect(
      repository.findPlan('tenant-alpha', 'plan-project-1')?.revision,
    ).toBe(2);

    await expectCode(
      service.reserveBudget(
        reservationDto({
          requestId: 'bad-currency',
          currency: 'EUR',
          expectedRevision: 2,
        }),
        actor(),
      ),
      ErrorCode.BIZ_ASSET_MISMATCH,
    );
    await expectCode(
      service.reserveBudget(
        reservationDto({
          requestId: 'expired',
          expiresAt: '2000-01-01T00:00:00.000Z',
          expectedRevision: 2,
        }),
        actor(),
      ),
      ErrorCode.BIZ_INVALID_STATE_TRANSITION,
    );
  });

  it('refuses a reservation that exceeds the remaining approved budget', async () => {
    await seed();
    await expectCode(
      service.reserveBudget(reservationDto({ amountMinor: 600001 }), actor()),
      ErrorCode.BIZ_BUDGET_INSUFFICIENT,
    );
  });

  it('creates an escrow intent tied to an accepted charter and configured payer', async () => {
    await seed();
    const reservation = await service.reserveBudget(reservationDto(), actor());
    expect(reservation.replayed).toBe(false);

    const result = await service.createEscrowIntent(intentDto(), actor());
    expect(result.intentId).toBe('intent-intent-request-1');
    expect(result.asset).toBe('XLM');
    expect(result.conditions).toEqual([
      { type: ReleaseConditionType.DELIVERABLE_ACCEPTED, ref: 'deliverable-1' },
    ]);
    expect(result.replayed).toBe(false);
  });

  it('refuses escrow intents with unknown charters, wrong payers or duplicate conditions', async () => {
    await seed();
    await service.reserveBudget(reservationDto(), actor());

    await expectCode(
      service.createEscrowIntent(
        intentDto({ charterId: 'charter-other', expectedRevision: 2 }),
        actor(),
      ),
      ErrorCode.RES_NOT_FOUND,
    );
    await expectCode(
      service.createEscrowIntent(
        intentDto({ payerId: 'intruder', expectedRevision: 2 }),
        actor(),
      ),
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
    await expectCode(
      service.createEscrowIntent(
        intentDto({
          expectedRevision: 2,
          conditions: [
            { type: ReleaseConditionType.ATTESTATION, ref: 'gate-1' },
            { type: ReleaseConditionType.ATTESTATION, ref: 'gate-1' },
          ],
        }),
        actor(),
      ),
      ErrorCode.VAL_INVALID_INPUT,
    );
  });

  it('refuses an escrow intent that exceeds the unreserved budget', async () => {
    await seed();
    await service.reserveBudget(reservationDto(), actor());

    await expectCode(
      service.createEscrowIntent(intentDto({ amountMinor: 350001 }), actor()),
      ErrorCode.BIZ_BUDGET_INSUFFICIENT,
    );
  });

  it('enforces tenant boundaries for every operation', async () => {
    await expectCode(
      service.configureFundingModel(
        modelDto({ tenantId: 'tenant-beta' }),
        actor(),
      ),
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
    await seed();

    await expectCode(
      service.createBudgetPlan(planDto({ tenantId: 'tenant-beta' }), actor()),
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
    await expectCode(
      service.reserveBudget(
        reservationDto({ tenantId: 'tenant-beta' }),
        actor(),
      ),
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
    await expectCode(
      service.createEscrowIntent(
        intentDto({ tenantId: 'tenant-beta' }),
        actor(),
      ),
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
    expect(
      repository.findModel('tenant-beta', 'model-project-1'),
    ).toBeUndefined();
  });

  it('denies authorization by default for unsupported roles and missing actors', async () => {
    await expectCode(
      service.configureFundingModel(
        modelDto(),
        actor(ProjectFundingRole.STUDENT),
      ),
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
    await expectCode(
      service.configureFundingModel(
        modelDto(),
        actor('unknown' as ProjectFundingRole),
      ),
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
    await expectCode(
      service.configureFundingModel(modelDto(), { ...actor(), id: '' }),
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
  });

  it('returns the original result for duplicate idempotency keys and rejects changed payloads', async () => {
    await seed();
    const first = await service.reserveBudget(reservationDto(), actor());
    const replay = await service.reserveBudget(reservationDto(), actor());

    expect(replay.reservationId).toBe(first.reservationId);
    expect(replay.replayed).toBe(true);
    expect(repository.listReservations('tenant-alpha')).toHaveLength(1);

    await expectCode(
      service.reserveBudget(reservationDto({ amountMinor: 100000 }), actor()),
      ErrorCode.BIZ_IDEMPOTENCY_KEY_REUSED,
    );
    await expectCode(
      service.createBudgetPlan(
        planDto({ requestId: 'reservation-request-1' }),
        actor(),
      ),
      ErrorCode.BIZ_IDEMPOTENCY_KEY_REUSED,
    );
  });

  it('serialises concurrent retries to a single mutation', async () => {
    await seed();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.reserveBudget(reservationDto(), actor()),
      ),
    );

    expect(new Set(results.map((result) => result.reservationId)).size).toBe(1);
    expect(repository.listReservations('tenant-alpha')).toHaveLength(1);
    expect(results.filter((result) => result.replayed).length).toBe(4);
  });

  it('records only actor, tenant, action, entity id and timestamp metadata', async () => {
    const recordSpy = jest.spyOn(audit, 'record');
    await service.configureFundingModel(modelDto(), actor());
    const call = recordSpy.mock.calls[0][0];

    expect(Object.keys(call).sort()).toEqual(
      ['actorId', 'actorRole', 'entityId', 'tenantId', 'action'].sort(),
    );
    expect(call).not.toHaveProperty('justification');
    expect(call).not.toHaveProperty('payerId');
    expect(Object.keys(audit.list()[0]).sort()).toEqual(
      [
        'actorId',
        'actorRole',
        'entityId',
        'tenantId',
        'timestamp',
        'action',
      ].sort(),
    );
  });

  it('drops private fields even if an audit caller supplies them', () => {
    const entry = audit.record({
      actorId: 'actor-admin',
      actorRole: 'admin',
      tenantId: 'tenant-alpha',
      action: 'project_funding.budget_plan.created',
      entityId: 'plan-project-1',
      justification: 'private proposal text',
      payerId: 'member-1',
    });

    expect(entry).not.toHaveProperty('justification');
    expect(entry).not.toHaveProperty('payerId');
    expect(audit.list()).toHaveLength(1);
  });
});
