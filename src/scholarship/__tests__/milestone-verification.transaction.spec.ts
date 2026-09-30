import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MilestoneVerificationService } from '../services/milestone-verification.service';
import { MilestoneEvidenceService } from '../services/milestone-evidence.service';
import { MilestoneScheduleService } from '../services/milestone-schedule.service';
import { ScholarshipAccessService } from '../services/scholarship-access.service';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxService } from '../../scholarship-outbox/services/outbox.service';
import { ScholarshipTransactionRunner } from '../../scholarship-outbox/services/scholarship-transaction.runner';
import { VerifierAssignment } from '../schemas/verifier-assignment.schema';
import { VerificationDecision } from '../schemas/verification-decision.schema';
import { VerificationDecisionDocument } from '../schemas/verification-decision.schema';
import { MilestoneProgress } from '../schemas/milestone-progress.schema';
import { MilestoneProgressDocument } from '../schemas/milestone-progress.schema';
import {
  MilestoneProgressStatus,
  VerificationDecisionType,
  REASON_CODES_BY_DECISION,
} from '../scholarship.constants';
import {
  PaymentEligibility,
  PaymentEligibilityDocument,
} from '../schemas/payment-eligibility.schema';
import { DomainEvents } from '../../events/event-names';

/**
 * #1255 — approving a milestone is what makes money move, and before the
 * transactional rewrite it was three independent writes: claim the progress row,
 * insert the decision, create the payment eligibility. A crash between any two
 * left a state the rest of the system could not explain — the worst being an
 * approved milestone with no decision row, which reviewers cannot audit and
 * reconciliation cannot attribute.
 *
 * These tests assert the property that makes that impossible: the claim, the
 * decision and the eligibility either all commit or none do. They assert on the
 * session each write was given, which is the only way to observe "same
 * transaction" from the outside — a spy that records the `session` argument
 * proves the claim, the decision and the eligibility were enlisted together.
 */
describe('MilestoneVerificationService.decide (transactional)', () => {
  let service: MilestoneVerificationService;
  let decisionModel: jest.Mocked<Model<VerificationDecisionDocument>>;
  let progressModel: jest.Mocked<Model<MilestoneProgressDocument>>;
  let eligibilityModel: jest.Mocked<Model<PaymentEligibilityDocument>>;
  let outbox: { stage: jest.Mock };
  let transactions: { run: jest.Mock };
  let session: Record<string, unknown>;

  const orgId = 'org-1';
  const awardId = 'award-1';
  const evidenceId = 'evidence-1';
  const milestoneKey = 'dissertation';
  const verifierId = 'verifier-1';

  const actor = {
    userId: verifierId,
    role: 'REVIEWER',
    assignmentIds: [],
    audit: { actorId: verifierId, actorRole: 'REVIEWER', ip: '1.2.3.4' },
  };

  /**
   * A stand-in for a Mongoose `Query`: it has `.session()` because
   * `withSession` calls it to enlist the query, and the value of having it is the
   * point — a query that cannot be enlisted cannot be part of the transaction.
   */
  const query = (value: unknown) => {
    const q = {
      session: jest.fn(),
      exec: jest.fn().mockResolvedValue(value),
    };
    q.session.mockReturnValue(q);
    return q;
  };

  beforeEach(async () => {
    session = { id: 'session-1' };
    outbox = { stage: jest.fn().mockResolvedValue(undefined) };
    transactions = {
      run: jest.fn((_label: string, work: (s: unknown) => unknown) =>
        work(session),
      ),
    };

    // Mongoose models are invoked with `new` and the instance is then saved, so
    // the stand-in constructor must *return* an object carrying `save` — a
    // `jest.fn()` with `Object.assign`ed properties does not, because `new`
    // discards it in favour of `this`.
    const makeModel = (id: string, statics: Record<string, unknown> = {}) =>
      Object.assign(
        jest.fn().mockImplementation((doc: Record<string, unknown>) => ({
          ...doc,
          id,
          save: jest
            .fn()
            .mockImplementation((opts?: { session?: unknown }) =>
              Promise.resolve({ ...doc, id, savedWith: opts?.session ?? null }),
            ),
        })),
        statics,
      );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MilestoneVerificationService,
        {
          provide: getModelToken(VerifierAssignment.name),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getModelToken(VerificationDecision.name),
          useValue: makeModel('decision-1', { exists: jest.fn() }),
        },
        {
          provide: getModelToken(PaymentEligibility.name),
          useValue: makeModel('elig-1', { findOne: jest.fn() }),
        },
        {
          provide: getModelToken(MilestoneProgress.name),
          useValue: { findOneAndUpdate: jest.fn(), exists: jest.fn() },
        },
        {
          provide: ScholarshipAccessService,
          useValue: { requireAward: jest.fn(), activeAssignment: jest.fn() },
        },
        {
          provide: MilestoneScheduleService,
          useValue: { requireActive: jest.fn() },
        },
        {
          provide: MilestoneEvidenceService,
          useValue: { requireEvidence: jest.fn() },
        },
        {
          provide: AuditService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: OutboxService, useValue: outbox },
        { provide: ScholarshipTransactionRunner, useValue: transactions },
      ],
    }).compile();

    service = module.get(MilestoneVerificationService);
    decisionModel = module.get(getModelToken(VerificationDecision.name));
    progressModel = module.get(getModelToken(MilestoneProgress.name));
    eligibilityModel = module.get(getModelToken(PaymentEligibility.name));

    // Authorization and tenancy gates pass by default; individual tests override.
    (
      service as never as { access: { requireAward: jest.Mock } }
    ).access.requireAward = jest.fn().mockResolvedValue({
      id: awardId,
      organizationId: orgId,
      recipientId: 'student-1',
      currency: 'USD',
      recipientWallet: 'wallet-1',
    });
    (
      service as never as { access: { activeAssignment: jest.Mock } }
    ).access.activeAssignment = jest
      .fn()
      .mockResolvedValue({ id: 'assignment-1' });
    (
      service as never as { evidence: { requireEvidence: jest.Mock } }
    ).evidence.requireEvidence = jest.fn().mockResolvedValue({
      id: evidenceId,
      milestoneKey,
      version: 2,
      submittedBy: 'student-1',
    });
    (
      service as never as { schedules: { requireActive: jest.Mock } }
    ).schedules.requireActive = jest.fn().mockResolvedValue({
      id: 'schedule-1',
      milestones: [{ key: milestoneKey, amountMinor: 40_000 }],
    });
  });

  const approve = (
    reasonCode = REASON_CODES_BY_DECISION[VerificationDecisionType.APPROVE][0],
  ) =>
    service.decide(
      orgId,
      awardId,
      evidenceId,
      {
        decision: VerificationDecisionType.APPROVE,
        reasonCode,
      },
      actor,
    );

  /** Makes the compare-and-set claim succeed with a progress row. */
  const claimSucceeds = (overrides: Record<string, unknown> = {}) => {
    (progressModel.findOneAndUpdate as jest.Mock).mockReturnValue(
      query({
        awardId,
        organizationId: orgId,
        milestoneKey,
        status: MilestoneProgressStatus.APPROVED,
        lastDecisionId: 'decision-1',
        latestEvidenceId: evidenceId,
        ...overrides,
      }),
    );
  };

  it('enlists the claim, the decision and the eligibility in one transaction', async () => {
    claimSucceeds();
    (eligibilityModel.findOne as jest.Mock).mockReturnValue(query(null));

    await approve();

    expect(transactions.run).toHaveBeenCalledTimes(1);

    // 1. The claim was enlisted in the transaction.
    const claimQuery = (progressModel.findOneAndUpdate as jest.Mock).mock
      .results[0].value;
    expect(claimQuery.session).toHaveBeenCalledWith(session);

    // 2. The decision insert carried the same session. Saved outside it, the
    //    decision would survive an abort of the claim — the "approved with no
    //    decision row" state this issue exists to remove.
    const decisionDoc = (decisionModel as unknown as jest.Mock).mock.results[0]
      .value;
    expect(decisionDoc.save).toHaveBeenCalledWith({ session });

    // 3. The eligibility insert did too.
    const eligibilityDoc = (eligibilityModel as unknown as jest.Mock).mock
      .results[0].value;
    expect(eligibilityDoc.save).toHaveBeenCalledWith({ session });

    // 4. And the event was staged under it, not emitted in-process.
    expect(outbox.stage).toHaveBeenCalledTimes(1);
    expect(outbox.stage.mock.calls[0][1]).toBe(session);
  });

  it('stages scholarship.payment-eligible rather than emitting it in-process', async () => {
    // Emitting from inside the transaction runs the listener before the commit,
    // so an abort leaves a consumer acting on a fact that does not exist.
    claimSucceeds();
    (eligibilityModel.findOne as jest.Mock).mockReturnValue(query(null));

    await approve();

    const [event] = outbox.stage.mock.calls[0];
    expect(event.eventName).toBe(DomainEvents.SCHOLARSHIP_PAYMENT_ELIGIBLE);
    // Only identifiers, minor-unit amount and currency — the outbox is not
    // tenant-partitioned and is read by the relay.
    expect(Object.keys(event.payload).sort()).toEqual([
      'amountMinor',
      'awardId',
      'currency',
      'eligibilityId',
      'milestoneKey',
      'organizationId',
    ]);
  });

  it('aborts without inserting a decision when the claim loses the race', async () => {
    // Two reviewers pressing Approve at once. Exactly one may proceed; the other
    // must not write a decision row, or the same evidence is decided twice.
    (progressModel.findOneAndUpdate as jest.Mock).mockReturnValue(query(null));
    (progressModel.exists as jest.Mock).mockReturnValue(
      query({ _id: 'existing-decision' }),
    );

    await expect(approve()).rejects.toThrow();

    expect(decisionModel).not.toHaveBeenCalled();
    expect(outbox.stage).not.toHaveBeenCalled();
  });

  it('does not create an eligibility for a rejection', async () => {
    // Rejected milestones must not become payable. Staging the eligibility event
    // here would start a disbursement for work that was refused.
    claimSucceeds();

    const result = await service.decide(
      orgId,
      awardId,
      evidenceId,
      {
        decision: VerificationDecisionType.REJECT,
        reasonCode:
          REASON_CODES_BY_DECISION[VerificationDecisionType.REJECT][0],
      },
      actor,
    );

    expect(result.paymentEligibility).toBeNull();
    expect(result.progressStatus).toBe(MilestoneProgressStatus.REJECTED);
    expect(eligibilityModel.findOne).not.toHaveBeenCalled();
    expect(outbox.stage).not.toHaveBeenCalled();
  });

  it('reuses an existing eligibility and stages no second event', async () => {
    // The reconciliation job can repair an approval concurrently. A duplicate
    // event would make two callers each believe they caused the payment.
    claimSucceeds();
    (eligibilityModel.findOne as jest.Mock).mockReturnValue(
      query({ id: 'elig-existing' }),
    );

    await approve();

    expect(outbox.stage).not.toHaveBeenCalled();
  });

  it('refuses a reason code that does not belong to the decision', async () => {
    // Checked before the transaction opens: a rejected-then-approved request
    // must never consume a claim attempt.
    await expect(
      service.decide(
        orgId,
        awardId,
        evidenceId,
        {
          decision: VerificationDecisionType.APPROVE,
          reasonCode:
            REASON_CODES_BY_DECISION[VerificationDecisionType.REJECT][0],
        },
        actor,
      ),
    ).rejects.toThrow(/not valid for decision/i);

    expect(transactions.run).not.toHaveBeenCalled();
  });

  it('refuses to let the award recipient verify their own award', async () => {
    (
      service as never as { access: { requireAward: jest.Mock } }
    ).access.requireAward = jest.fn().mockResolvedValue({
      id: awardId,
      organizationId: orgId,
      recipientId: actor.userId,
    });

    await expect(approve()).rejects.toThrow(/cannot verify their own award/i);
    expect(transactions.run).not.toHaveBeenCalled();
  });

  it('refuses a verifier with no active assignment for the milestone', async () => {
    (
      service as never as { access: { activeAssignment: jest.Mock } }
    ).access.activeAssignment = jest.fn().mockResolvedValue(null);

    await expect(approve()).rejects.toThrow(/not an assigned verifier/i);
    expect(transactions.run).not.toHaveBeenCalled();
  });
});
