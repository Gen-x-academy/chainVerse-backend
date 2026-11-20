import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AggregateOutcomesDto,
  CalibrationPolicy,
  DeliverableDecision,
  DeliverableKind,
  MissingReviewPolicy,
  RegisterProposalDto,
  ReviewDeliverableDto,
  SubmitDeliverableDto,
  SubmitReviewDto,
} from './dto/review-outcomes.dto';
import { ReviewOutcomesRepository } from './review-outcomes.repository';
import { ReviewOutcomesService } from './review-outcomes.service';
import { ActorContext } from './review-outcomes.types';

function actor(
  roles: string[],
  actorId = 'user-a',
  tenantId = 'tenant-a',
): ActorContext {
  return { tenantId, actorId, roles };
}

function scores(...entries: Array<[string, number]>) {
  return entries.map(([criterion, score]) => ({ criterion, score }));
}

async function registerProposal(
  service: ReviewOutcomesService,
  idempotencyKey = `proposal-${Math.random()}`,
  criteria = ['quality', 'impact'],
  submitter = actor(['submitter']),
): Promise<string> {
  const result = await service.registerProposal(submitter, {
    idempotencyKey,
    privatePayload: 'SECRET_PROPOSAL_PAYLOAD',
    criteria,
  });
  return String(result['proposalId']);
}

async function submitDeliverable(
  service: ReviewOutcomesService,
  reviewerIds = ['reviewer-a', 'reviewer-b'],
  idempotencyKey = `deliverable-${Math.random()}`,
  submitter = actor(['submitter']),
): Promise<string> {
  const result = await service.submitDeliverable(submitter, 'milestone-1', {
    idempotencyKey,
    milestoneId: 'milestone-1',
    kind: DeliverableKind.FILE,
    reference: 'SECRET_DELIVERABLE_REFERENCE',
    checksum: 'sha256:abc',
    reviewerIds,
    requirementIds: ['requirement-1'],
    requiredApprovals: 1,
  });
  return String(result['deliverableId']);
}

describe('ReviewOutcomesService', () => {
  let repository: ReviewOutcomesRepository;
  let service: ReviewOutcomesService;

  beforeEach(() => {
    repository = new ReviewOutcomesRepository();
    service = new ReviewOutcomesService(repository);
  });

  describe('fair aggregation', () => {
    it('aggregates current-version reviews without mutating scores', async () => {
      const proposalId = await registerProposal(service, 'proposal-fair');
      await service.submitReview(
        actor(['reviewer'], 'reviewer-1'),
        proposalId,
        {
          idempotencyKey: 'review-1',
          proposalVersion: 1,
          scores: scores(['quality', 80], ['impact', 60]),
          comment: 'PRIVATE_REVIEW_COMMENT_1',
        },
      );
      await service.submitReview(
        actor(['reviewer'], 'reviewer-2'),
        proposalId,
        {
          idempotencyKey: 'review-2',
          proposalVersion: 1,
          scores: scores(['quality', 70], ['impact', 80]),
        },
      );
      await service.submitReview(
        actor(['reviewer'], 'reviewer-3'),
        proposalId,
        {
          idempotencyKey: 'review-3',
          proposalVersion: 1,
          scores: scores(['quality', 90], ['impact', 100]),
        },
      );

      const outcome = await service.aggregateOutcomes(
        actor(['coordinator'], 'coordinator-1'),
        proposalId,
        {
          idempotencyKey: 'aggregate-fair',
          quorum: 3,
          acceptanceThreshold: 75,
          calibrationPolicy: CalibrationPolicy.NONE,
          missingReviewPolicy: MissingReviewPolicy.ABSTAIN,
        },
      );

      expect(outcome['outcome']).toBe('accept');
      expect(outcome['aggregateScore']).toBe(80);
      expect(outcome['receivedReviews']).toBe(3);
      expect(outcome['missingReviews']).toBe(0);
      expect(outcome['scoreAdjustments']).toEqual([
        {
          criterion: 'quality',
          rawMean: 80,
          adjustedMean: 80,
          trimmed: false,
          zeroFilledCount: 0,
        },
        {
          criterion: 'impact',
          rawMean: 80,
          adjustedMean: 80,
          trimmed: false,
          zeroFilledCount: 0,
        },
      ]);
      const stored = repository.reviews.values('tenant-a');
      expect(stored.map((review) => review.scores.quality)).toEqual([
        80, 70, 90,
      ]);
    });

    it('handles missing reviews with abstain and explicit zero fill', async () => {
      const proposalId = await registerProposal(service, 'proposal-missing');
      await service.submitReview(
        actor(['reviewer'], 'reviewer-1'),
        proposalId,
        {
          idempotencyKey: 'review-missing',
          proposalVersion: 1,
          scores: scores(['quality', 80], ['impact', 80]),
        },
      );

      const abstain = await service.aggregateOutcomes(
        actor(['coordinator'], 'coordinator-1'),
        proposalId,
        {
          idempotencyKey: 'aggregate-abstain',
          quorum: 3,
          acceptanceThreshold: 70,
          calibrationPolicy: CalibrationPolicy.NONE,
          missingReviewPolicy: MissingReviewPolicy.ABSTAIN,
        },
      );
      expect(abstain['outcome']).toBe('insufficient_reviews');
      expect(abstain['aggregateScore']).toBe(80);
      expect(abstain['missingReviews']).toBe(2);

      const zeroFill = await service.aggregateOutcomes(
        actor(['coordinator'], 'coordinator-1'),
        proposalId,
        {
          idempotencyKey: 'aggregate-zero-fill',
          quorum: 3,
          acceptanceThreshold: 70,
          calibrationPolicy: CalibrationPolicy.NONE,
          missingReviewPolicy: MissingReviewPolicy.ZERO_FILL,
        },
      );
      expect(zeroFill['outcome']).toBe('reject');
      expect(zeroFill['aggregateScore']).toBe(26.67);
      expect(zeroFill['scoreAdjustments']).toEqual([
        expect.objectContaining({ zeroFilledCount: 2 }),
        expect.objectContaining({ zeroFilledCount: 2 }),
      ]);

      await expect(
        service.aggregateOutcomes(
          actor(['coordinator'], 'coordinator-1'),
          proposalId,
          {
            idempotencyKey: 'aggregate-strict',
            quorum: 3,
            acceptanceThreshold: 70,
            calibrationPolicy: CalibrationPolicy.NONE,
            missingReviewPolicy: MissingReviewPolicy.ABSTAIN,
            strictQuorum: true,
          },
        ),
      ).rejects.toThrow('QUORUM_NOT_MET');
    });

    it('applies trim-outlier calibration explicitly', async () => {
      const proposalId = await registerProposal(service, 'proposal-trim');
      const values = [0, 50, 60, 100];
      for (let index = 0; index < values.length; index += 1) {
        await service.submitReview(
          actor(['reviewer'], `reviewer-${index}`),
          proposalId,
          {
            idempotencyKey: `trim-review-${index}`,
            proposalVersion: 1,
            scores: scores(
              ['quality', values[index]],
              ['impact', values[index]],
            ),
          },
        );
      }

      const trimmed = await service.aggregateOutcomes(
        actor(['coordinator'], 'coordinator-1'),
        proposalId,
        {
          idempotencyKey: 'aggregate-trim',
          quorum: 4,
          acceptanceThreshold: 54,
          calibrationPolicy: CalibrationPolicy.TRIM_OUTLIERS,
          missingReviewPolicy: MissingReviewPolicy.ABSTAIN,
        },
      );
      expect(trimmed['aggregateScore']).toBe(55);
      expect(trimmed['outcome']).toBe('accept');
      expect(trimmed['scoreAdjustments']).toEqual([
        expect.objectContaining({
          rawMean: 52.5,
          adjustedMean: 55,
          trimmed: true,
        }),
        expect.objectContaining({
          rawMean: 52.5,
          adjustedMean: 55,
          trimmed: true,
        }),
      ]);

      const uncalibrated = await service.aggregateOutcomes(
        actor(['coordinator'], 'coordinator-1'),
        proposalId,
        {
          idempotencyKey: 'aggregate-no-calibration',
          quorum: 4,
          acceptanceThreshold: 54,
          calibrationPolicy: CalibrationPolicy.NONE,
          missingReviewPolicy: MissingReviewPolicy.ABSTAIN,
        },
      );
      expect(uncalibrated['aggregateScore']).toBe(52.5);
      expect(uncalibrated['outcome']).toBe('reject');
    });

    it('escalates an exact threshold tie', async () => {
      const proposalId = await registerProposal(service, 'proposal-tie', [
        'quality',
      ]);
      await service.submitReview(
        actor(['reviewer'], 'reviewer-1'),
        proposalId,
        {
          idempotencyKey: 'tie-review',
          proposalVersion: 1,
          scores: scores(['quality', 80]),
        },
      );
      const outcome = await service.aggregateOutcomes(
        actor(['coordinator'], 'coordinator-1'),
        proposalId,
        {
          idempotencyKey: 'aggregate-tie',
          quorum: 1,
          acceptanceThreshold: 80,
          calibrationPolicy: CalibrationPolicy.NONE,
          missingReviewPolicy: MissingReviewPolicy.ABSTAIN,
        },
      );
      expect(outcome['outcome']).toBe('needs_decision');
      expect(outcome['tieTreatment']).toBe('escalate_on_exact_threshold');
    });

    it('rejects stale review versions', async () => {
      const proposalId = await registerProposal(service, 'proposal-stale');
      await expect(
        service.submitReview(actor(['reviewer'], 'reviewer-1'), proposalId, {
          idempotencyKey: 'stale-review',
          proposalVersion: 2,
          scores: scores(['quality', 80], ['impact', 80]),
        }),
      ).rejects.toThrow('STALE_PROPOSAL_VERSION');
    });
  });

  describe('revision rules', () => {
    it('requests revisions and requires the exact next version', async () => {
      const proposalId = await registerProposal(service, 'proposal-revision');
      await service.submitReview(
        actor(['reviewer'], 'reviewer-1'),
        proposalId,
        {
          idempotencyKey: 'revision-review',
          proposalVersion: 1,
          scores: scores(['quality', 80], ['impact', 80]),
        },
      );
      const request = await service.requestRevision(
        actor(['coordinator'], 'coordinator-1'),
        proposalId,
        {
          idempotencyKey: 'revision-request',
          proposalVersion: 1,
          deadline: new Date(Date.now() + 60_000).toISOString(),
          instructions: 'SECRET_REVISION_INSTRUCTIONS',
        },
      );
      const requestId = String(request['revisionRequestId']);

      await expect(
        service.requestRevision(
          actor(['coordinator'], 'coordinator-1'),
          proposalId,
          {
            idempotencyKey: 'revision-request-duplicate',
            proposalVersion: 1,
            deadline: new Date(Date.now() + 60_000).toISOString(),
            instructions: 'SECOND_INSTRUCTIONS',
          },
        ),
      ).rejects.toThrow('REVISION_ALREADY_PENDING');

      await expect(
        service.respondToRevision(actor(['submitter']), proposalId, requestId, {
          idempotencyKey: 'revision-bad-version',
          newVersion: 3,
          privatePayload: 'SECRET_NEW_PROPOSAL',
        }),
      ).rejects.toThrow('INVALID_RESUBMISSION_VERSION');

      const response = await service.respondToRevision(
        actor(['submitter']),
        proposalId,
        requestId,
        {
          idempotencyKey: 'revision-response',
          newVersion: 2,
          privatePayload: 'SECRET_NEW_PROPOSAL',
        },
      );
      expect(response['proposal']).toEqual(
        expect.objectContaining({ version: 2, status: 'submitted' }),
      );
      expect(response['revisionRequest']).toEqual(
        expect.objectContaining({ status: 'answered', responseVersion: 2 }),
      );

      const outcome = await service.aggregateOutcomes(
        actor(['coordinator'], 'coordinator-1'),
        proposalId,
        {
          idempotencyKey: 'revision-aggregate',
          quorum: 1,
          acceptanceThreshold: 70,
          calibrationPolicy: CalibrationPolicy.NONE,
          missingReviewPolicy: MissingReviewPolicy.ZERO_FILL,
        },
      );
      expect(outcome['proposalVersion']).toBe(2);
      expect(outcome['missingReviews']).toBe(1);
    });

    it('rejects past deadlines and expired response windows', async () => {
      const proposalId = await registerProposal(service, 'proposal-deadline');
      await expect(
        service.requestRevision(
          actor(['coordinator'], 'coordinator-1'),
          proposalId,
          {
            idempotencyKey: 'revision-past-deadline',
            proposalVersion: 1,
            deadline: new Date(Date.now() - 60_000).toISOString(),
            instructions: 'SECRET',
          },
        ),
      ).rejects.toThrow('REVISION_DEADLINE_PAST');

      const request = await service.requestRevision(
        actor(['coordinator'], 'coordinator-1'),
        proposalId,
        {
          idempotencyKey: 'revision-expiring',
          proposalVersion: 1,
          deadline: new Date(Date.now() + 60_000).toISOString(),
          instructions: 'SECRET',
        },
      );
      const record = repository.revisionRequests.get(
        'tenant-a',
        String(request['revisionRequestId']),
      );
      record!.deadline = new Date(Date.now() - 1000).toISOString();
      await expect(
        service.respondToRevision(
          actor(['submitter']),
          proposalId,
          String(request['revisionRequestId']),
          {
            idempotencyKey: 'revision-expired-response',
            newVersion: 2,
            privatePayload: 'SECRET',
          },
        ),
      ).rejects.toThrow('REVISION_DEADLINE_EXPIRED');
    });
  });

  describe('milestone deliverables', () => {
    it('submits and accepts a deliverable with designated reviewers', async () => {
      const deliverableId = await submitDeliverable(service);
      const accepted = await service.reviewDeliverable(
        actor(['reviewer'], 'reviewer-a'),
        'milestone-1',
        deliverableId,
        {
          idempotencyKey: 'accept-deliverable',
          decision: DeliverableDecision.ACCEPT,
          rubricScores: scores(['requirement-1', 95]),
          rationale: 'SECRET_REVIEWER_RATIONALE',
        },
      );
      expect(accepted['deliverable']).toEqual(
        expect.objectContaining({ status: 'accepted', acceptCount: 1 }),
      );
      expect(accepted['review']).toEqual(
        expect.objectContaining({ decision: 'accept', deliverableVersion: 1 }),
      );
    });

    it('denies self-review, undesignated reviewers, and stale versions', async () => {
      const deliverableId = await submitDeliverable(service);
      await expect(
        service.reviewDeliverable(
          actor(['reviewer'], 'user-a'),
          'milestone-1',
          deliverableId,
          {
            idempotencyKey: 'self-review',
            decision: DeliverableDecision.ACCEPT,
            rubricScores: scores(['requirement-1', 90]),
            rationale: 'SECRET',
          },
        ),
      ).rejects.toThrow('SUBMITTER_CANNOT_REVIEW');

      await expect(
        service.reviewDeliverable(
          actor(['reviewer'], 'intruder'),
          'milestone-1',
          deliverableId,
          {
            idempotencyKey: 'intruder-review',
            decision: DeliverableDecision.ACCEPT,
            rubricScores: scores(['requirement-1', 90]),
            rationale: 'SECRET',
          },
        ),
      ).rejects.toThrow('REVIEWER_NOT_DESIGNATED');

      await submitDeliverable(service, ['reviewer-a'], 'deliverable-v2');
      await expect(
        service.reviewDeliverable(
          actor(['reviewer'], 'reviewer-a'),
          'milestone-1',
          deliverableId,
          {
            idempotencyKey: 'stale-deliverable-review',
            decision: DeliverableDecision.ACCEPT,
            rubricScores: scores(['requirement-1', 90]),
            rationale: 'SECRET',
          },
        ),
      ).rejects.toThrow('DELIVERABLE_VERSION_NOT_CURRENT');
    });

    it('blocks changes and duplicate decisions on the same version', async () => {
      const deliverableId = await submitDeliverable(service);
      await service.reviewDeliverable(
        actor(['reviewer'], 'reviewer-a'),
        'milestone-1',
        deliverableId,
        {
          idempotencyKey: 'changes-request',
          decision: DeliverableDecision.REQUEST_CHANGES,
          rubricScores: scores(['requirement-1', 40]),
          rationale: 'SECRET',
        },
      );
      await expect(
        service.reviewDeliverable(
          actor(['reviewer'], 'reviewer-b'),
          'milestone-1',
          deliverableId,
          {
            idempotencyKey: 'accept-after-changes',
            decision: DeliverableDecision.ACCEPT,
            rubricScores: scores(['requirement-1', 90]),
            rationale: 'SECRET',
          },
        ),
      ).rejects.toThrow('DELIVERABLE_CHANGES_PENDING');

      const second = await service.submitDeliverable(
        actor(['submitter']),
        'milestone-1',
        {
          idempotencyKey: 'deliverable-second',
          milestoneId: 'milestone-1',
          kind: DeliverableKind.LINK,
          reference: 'SECRET_SECOND_REFERENCE',
          reviewerIds: ['reviewer-a', 'reviewer-b'],
          requirementIds: ['requirement-1'],
          requiredApprovals: 2,
        },
      );
      const secondId = String(second['deliverableId']);
      await service.reviewDeliverable(
        actor(['reviewer'], 'reviewer-a'),
        'milestone-1',
        secondId,
        {
          idempotencyKey: 'second-review',
          decision: DeliverableDecision.ACCEPT,
          rubricScores: scores(['requirement-1', 90]),
          rationale: 'SECRET',
        },
      );
      await expect(
        service.reviewDeliverable(
          actor(['reviewer'], 'reviewer-a'),
          'milestone-1',
          secondId,
          {
            idempotencyKey: 'second-review-again',
            decision: DeliverableDecision.REJECT,
            rubricScores: scores(['requirement-1', 10]),
            rationale: 'SECRET',
          },
        ),
      ).rejects.toThrow('DELIVERABLE_REVIEW_ALREADY_SUBMITTED');
    });
  });

  describe('tenant isolation and authorization', () => {
    it('does not resolve entities from another tenant', async () => {
      const proposalId = await registerProposal(service, 'proposal-tenant');
      const deliverableId = await submitDeliverable(
        service,
        ['reviewer-a'],
        'deliverable-tenant',
      );
      const otherTenant = actor(['reviewer'], 'user-b', 'tenant-b');
      await expect(
        service.submitReview(otherTenant, proposalId, {
          idempotencyKey: 'cross-tenant-review',
          proposalVersion: 1,
          scores: scores(['quality', 80], ['impact', 80]),
        }),
      ).rejects.toThrow('REVIEW_OUTCOMES_NOT_FOUND');
      await expect(
        service.reviewDeliverable(otherTenant, 'milestone-1', deliverableId, {
          idempotencyKey: 'cross-tenant-decision',
          decision: DeliverableDecision.ACCEPT,
          rubricScores: scores(['requirement-1', 90]),
          rationale: 'SECRET',
        }),
      ).rejects.toThrow('REVIEW_OUTCOMES_NOT_FOUND');
      expect(repository.listAudit('tenant-b')).toHaveLength(0);
    });

    it('denies unknown, missing, and disallowed roles by default', async () => {
      const proposalId = await registerProposal(service, 'proposal-auth');
      const request = {
        idempotencyKey: 'auth-aggregate',
        quorum: 1,
        acceptanceThreshold: 70,
        calibrationPolicy: CalibrationPolicy.NONE,
        missingReviewPolicy: MissingReviewPolicy.ABSTAIN,
      };
      await expect(
        service.aggregateOutcomes(actor(['student']), proposalId, request),
      ).rejects.toThrow('REVIEW_OUTCOMES_ROLE_DENIED');
      await expect(
        service.aggregateOutcomes(actor([]), proposalId, request),
      ).rejects.toThrow('REVIEW_OUTCOMES_ACCESS_DENIED');
      await expect(
        service.aggregateOutcomes(
          { tenantId: '', actorId: 'user-a', roles: ['admin'] },
          proposalId,
          request,
        ),
      ).rejects.toThrow('REVIEW_OUTCOMES_ACCESS_DENIED');
    });
  });

  describe('idempotency and concurrency', () => {
    it('replays a retry and conflicts when the key is reused with another body', async () => {
      const first = await service.registerProposal(actor(['submitter']), {
        idempotencyKey: 'same-key',
        privatePayload: 'SECRET_FIRST',
        criteria: ['quality'],
      });
      const replay = await service.registerProposal(actor(['submitter']), {
        idempotencyKey: 'same-key',
        privatePayload: 'SECRET_FIRST',
        criteria: ['quality'],
      });
      expect(replay).toEqual({ ...first, replayed: true });
      expect(repository.proposals.values('tenant-a')).toHaveLength(1);
      await expect(
        service.registerProposal(actor(['submitter']), {
          idempotencyKey: 'same-key',
          privatePayload: 'SECRET_SECOND',
          criteria: ['quality'],
        }),
      ).rejects.toThrow('IDEMPOTENCY_KEY_REUSE');
    });

    it('serializes concurrent retries into one mutation', async () => {
      const results = await Promise.all([
        service.registerProposal(actor(['submitter']), {
          idempotencyKey: 'concurrent-key',
          privatePayload: 'SECRET',
          criteria: ['quality'],
        }),
        service.registerProposal(actor(['submitter']), {
          idempotencyKey: 'concurrent-key',
          privatePayload: 'SECRET',
          criteria: ['quality'],
        }),
        service.registerProposal(actor(['submitter']), {
          idempotencyKey: 'concurrent-key',
          privatePayload: 'SECRET',
          criteria: ['quality'],
        }),
      ]);
      expect(
        results.filter((result) => result['replayed'] === false),
      ).toHaveLength(1);
      expect(repository.proposals.values('tenant-a')).toHaveLength(1);
    });
  });

  describe('audit redaction', () => {
    it('records metadata only for all four workflows', async () => {
      const proposalId = await registerProposal(service, 'proposal-audit');
      await service.submitReview(
        actor(['reviewer'], 'reviewer-1'),
        proposalId,
        {
          idempotencyKey: 'audit-review',
          proposalVersion: 1,
          scores: scores(['quality', 80], ['impact', 80]),
          comment: 'SECRET_COMMENT',
        },
      );
      await service.aggregateOutcomes(
        actor(['coordinator'], 'coordinator-1'),
        proposalId,
        {
          idempotencyKey: 'audit-aggregate',
          quorum: 1,
          acceptanceThreshold: 80,
          calibrationPolicy: CalibrationPolicy.NONE,
          missingReviewPolicy: MissingReviewPolicy.ABSTAIN,
        },
      );
      await service.requestRevision(
        actor(['coordinator'], 'coordinator-1'),
        proposalId,
        {
          idempotencyKey: 'audit-revision',
          proposalVersion: 1,
          deadline: new Date(Date.now() + 60_000).toISOString(),
          instructions: 'SECRET_INSTRUCTIONS',
        },
      );
      const deliverableId = await submitDeliverable(
        service,
        ['reviewer-a'],
        'audit-deliverable',
      );
      await service.reviewDeliverable(
        actor(['reviewer'], 'reviewer-a'),
        'milestone-1',
        deliverableId,
        {
          idempotencyKey: 'audit-decision',
          decision: DeliverableDecision.ACCEPT,
          rubricScores: scores(['requirement-1', 90]),
          rationale: 'SECRET_RATIONALE',
        },
      );

      const entries = await service.listAudit(
        actor(['coordinator'], 'coordinator-1'),
      );
      expect(entries.length).toBeGreaterThanOrEqual(6);
      for (const entry of entries) {
        expect(entry).toEqual(
          expect.objectContaining({
            tenantId: 'tenant-a',
            actorId: expect.any(String),
            action: expect.any(String),
            entityId: expect.any(String),
            timestamp: expect.any(String),
            metadata: expect.any(Object),
          }),
        );
      }
      const serialized = JSON.stringify(entries);
      for (const secret of [
        'SECRET_PROPOSAL_PAYLOAD',
        'SECRET_COMMENT',
        'SECRET_INSTRUCTIONS',
        'SECRET_DELIVERABLE_REFERENCE',
        'SECRET_RATIONALE',
      ]) {
        expect(serialized).not.toContain(secret);
      }
    });

    it('denies audit access to non-coordinators', async () => {
      await expect(service.listAudit(actor(['submitter']))).rejects.toThrow(
        'REVIEW_OUTCOMES_ROLE_DENIED',
      );
    });
  });

  describe('DTO validation', () => {
    it('rejects invalid aggregation and submission payloads', async () => {
      const invalidAggregate = await validate(
        plainToInstance(AggregateOutcomesDto, {
          idempotencyKey: 'key',
          quorum: 0,
          acceptanceThreshold: 120,
          calibrationPolicy: 'unknown',
          missingReviewPolicy: MissingReviewPolicy.ABSTAIN,
        }),
      );
      expect(invalidAggregate.length).toBeGreaterThan(0);

      const invalidReview = await validate(
        plainToInstance(SubmitReviewDto, {
          idempotencyKey: 'key',
          proposalVersion: 1,
          scores: [{ criterion: 'quality', score: 101 }],
        }),
      );
      expect(invalidReview.length).toBeGreaterThan(0);

      const invalidDeliverable = await validate(
        plainToInstance(SubmitDeliverableDto, {
          idempotencyKey: 'key',
          milestoneId: 'milestone-1',
          kind: 'unknown',
          reference: 'reference',
          reviewerIds: [],
          requirementIds: ['requirement-1'],
          requiredApprovals: 11,
        }),
      );
      expect(invalidDeliverable.length).toBeGreaterThan(0);

      const invalidDecision = await validate(
        plainToInstance(ReviewDeliverableDto, {
          idempotencyKey: 'key',
          decision: 'maybe',
          rubricScores: [{ criterion: 'requirement-1', score: 90 }],
          rationale: 'reason',
        }),
      );
      expect(invalidDecision.length).toBeGreaterThan(0);
    });

    it('accepts a valid registration DTO', async () => {
      const errors = await validate(
        plainToInstance(RegisterProposalDto, {
          idempotencyKey: 'key',
          privatePayload: 'payload',
          criteria: ['quality'],
        }),
      );
      expect(errors).toHaveLength(0);
    });
  });
});
