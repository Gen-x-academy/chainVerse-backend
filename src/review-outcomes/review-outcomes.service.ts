import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import {
  AggregateOutcomesDto,
  CalibrationPolicy,
  DeliverableDecision,
  MissingReviewPolicy,
  RegisterProposalDto,
  RequestRevisionDto,
  RespondToRevisionDto,
  ReviewDeliverableDto,
  SubmitDeliverableDto,
  SubmitReviewDto,
} from './dto/review-outcomes.dto';
import {
  clone,
  ReviewOutcomesRepository,
  TenantStore,
} from './review-outcomes.repository';
import {
  ActorContext,
  AuditEntry,
  DeliverableRecord,
  DeliverableReviewRecord,
  DeliverableStatus,
  Operation,
  OutcomeRecord,
  ProposalRecord,
  ProposalStatus,
  ReviewOutcomeRole,
  ReviewRecord,
  RevisionRequestRecord,
} from './review-outcomes.types';

type MutatingRequest = { idempotencyKey: string };
type ScoredCriterion = { criterion: string; score: number };

const OPERATION_ROLES: Record<Operation, ReviewOutcomeRole[]> = {
  register_proposal: [ReviewOutcomeRole.SUBMITTER, ReviewOutcomeRole.ADMIN],
  submit_review: [ReviewOutcomeRole.REVIEWER, ReviewOutcomeRole.ADMIN],
  aggregate_outcomes: [
    ReviewOutcomeRole.COORDINATOR,
    ReviewOutcomeRole.REVIEWER,
    ReviewOutcomeRole.ADMIN,
  ],
  request_revision: [
    ReviewOutcomeRole.REVIEWER,
    ReviewOutcomeRole.COORDINATOR,
    ReviewOutcomeRole.ADMIN,
  ],
  respond_to_revision: [ReviewOutcomeRole.SUBMITTER, ReviewOutcomeRole.ADMIN],
  submit_deliverable: [ReviewOutcomeRole.SUBMITTER, ReviewOutcomeRole.ADMIN],
  review_deliverable: [ReviewOutcomeRole.REVIEWER, ReviewOutcomeRole.ADMIN],
  list_audit: [ReviewOutcomeRole.COORDINATOR, ReviewOutcomeRole.ADMIN],
};

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortDeep(item));
  }
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortDeep(source[key]);
        return result;
      }, {});
  }
  return value;
}

function requestFingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(sortDeep(value)))
    .digest('hex');
}

function scoreMap(entries: ScoredCriterion[]): Record<string, number> {
  return entries.reduce<Record<string, number>>((scores, entry) => {
    scores[entry.criterion] = entry.score;
    return scores;
  }, {});
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function rounded(value: number): number {
  return Number(value.toFixed(2));
}

@Injectable()
export class ReviewOutcomesService {
  constructor(private readonly repository: ReviewOutcomesRepository) {}

  async registerProposal(
    actor: ActorContext,
    dto: RegisterProposalDto,
  ): Promise<Record<string, unknown>> {
    return this.mutate(actor, 'register_proposal', dto, () => {
      const criteria = Array.from(new Set(dto.criteria));
      if (criteria.length !== dto.criteria.length) {
        throw new BadRequestException('DUPLICATE_CRITERIA');
      }
      const now = new Date().toISOString();
      const proposal: ProposalRecord = {
        proposalId: randomUUID(),
        tenantId: actor.tenantId,
        version: 1,
        ownerId: actor.actorId,
        status: ProposalStatus.SUBMITTED,
        criteria,
        privatePayload: dto.privatePayload,
        createdAt: now,
        updatedAt: now,
      };
      this.repository.proposals.put(
        actor.tenantId,
        proposal.proposalId,
        clone(proposal),
      );
      this.audit(actor, 'register_proposal', proposal.proposalId, {
        proposalVersion: proposal.version,
        criteriaCount: criteria.length,
      });
      return this.proposalView(proposal);
    });
  }

  async submitReview(
    actor: ActorContext,
    proposalId: string,
    dto: SubmitReviewDto,
  ): Promise<Record<string, unknown>> {
    return this.mutate(actor, 'submit_review', dto, () => {
      const proposal = this.require(
        this.repository.proposals,
        actor.tenantId,
        proposalId,
      );
      this.assertOpenProposal(proposal);
      if (dto.proposalVersion !== proposal.version) {
        throw new BadRequestException('STALE_PROPOSAL_VERSION');
      }
      if (
        this.repository.reviews
          .values(actor.tenantId)
          .some(
            (review) =>
              review.proposalId === proposalId &&
              review.proposalVersion === proposal.version &&
              review.reviewerId === actor.actorId,
          )
      ) {
        throw new ConflictException('REVIEW_ALREADY_SUBMITTED');
      }
      const scores = scoreMap(dto.scores);
      if (Object.keys(scores).length !== proposal.criteria.length) {
        throw new BadRequestException('CRITERIA_MISMATCH');
      }
      if (!proposal.criteria.every((criterion) => criterion in scores)) {
        throw new BadRequestException('CRITERIA_MISMATCH');
      }
      const review: ReviewRecord = {
        reviewId: randomUUID(),
        tenantId: actor.tenantId,
        proposalId,
        proposalVersion: proposal.version,
        reviewerId: actor.actorId,
        scores,
        comment: dto.comment,
        createdAt: new Date().toISOString(),
      };
      this.repository.reviews.put(
        actor.tenantId,
        review.reviewId,
        clone(review),
      );
      this.audit(actor, 'submit_review', review.reviewId, {
        proposalId,
        proposalVersion: review.proposalVersion,
        criterionCount: dto.scores.length,
      });
      return this.reviewView(review);
    });
  }

  async aggregateOutcomes(
    actor: ActorContext,
    proposalId: string,
    dto: AggregateOutcomesDto,
  ): Promise<Record<string, unknown>> {
    return this.mutate(actor, 'aggregate_outcomes', dto, () => {
      const proposal = this.require(
        this.repository.proposals,
        actor.tenantId,
        proposalId,
      );
      const currentReviews = this.repository.reviews
        .values(actor.tenantId)
        .filter(
          (review) =>
            review.proposalId === proposalId &&
            review.proposalVersion === proposal.version,
        );
      const missingReviews = Math.max(0, dto.quorum - currentReviews.length);
      if (missingReviews > 0 && dto.strictQuorum) {
        throw new BadRequestException('QUORUM_NOT_MET');
      }
      const calibration =
        dto.calibrationPolicy === CalibrationPolicy.TRIM_OUTLIERS &&
        currentReviews.length >= 4;
      const scoreAdjustments: Array<Record<string, unknown>> = [];
      const criterionMeans: number[] = [];
      for (const criterion of proposal.criteria) {
        const raw = currentReviews.map(
          (review) => review.scores[criterion] ?? 0,
        );
        let adjusted = [...raw];
        if (calibration) {
          adjusted = adjusted.sort((left, right) => left - right).slice(1, -1);
        }
        if (dto.missingReviewPolicy === MissingReviewPolicy.ZERO_FILL) {
          adjusted.push(...Array<number>(missingReviews).fill(0));
        }
        const rawMean = mean(raw);
        const adjustedMean = mean(adjusted);
        criterionMeans.push(adjustedMean);
        scoreAdjustments.push({
          criterion,
          rawMean: rounded(rawMean),
          adjustedMean: rounded(adjustedMean),
          trimmed: calibration,
          zeroFilledCount:
            dto.missingReviewPolicy === MissingReviewPolicy.ZERO_FILL
              ? missingReviews
              : 0,
        });
      }
      const aggregateScore = rounded(mean(criterionMeans));
      let outcome: string;
      if (
        missingReviews > 0 &&
        dto.missingReviewPolicy === MissingReviewPolicy.ABSTAIN
      ) {
        outcome = 'insufficient_reviews';
      } else if (Math.abs(aggregateScore - dto.acceptanceThreshold) < 1e-9) {
        outcome = 'needs_decision';
      } else if (aggregateScore > dto.acceptanceThreshold) {
        outcome = 'accept';
      } else {
        outcome = 'reject';
      }
      const explanations = [
        `received_reviews=${currentReviews.length}`,
        `missing_reviews=${missingReviews} handled_by=${dto.missingReviewPolicy}`,
        `calibration_policy=${dto.calibrationPolicy}${calibration ? ' applied' : ' not_applied'}`,
        'tie_treatment=escalate_on_exact_threshold',
      ];
      const recorded: OutcomeRecord = {
        outcomeId: randomUUID(),
        tenantId: actor.tenantId,
        proposalId,
        proposalVersion: proposal.version,
        outcome,
        aggregateScore,
        quorum: dto.quorum,
        receivedReviews: currentReviews.length,
        missingReviews,
        calibrationPolicy: dto.calibrationPolicy,
        missingReviewPolicy: dto.missingReviewPolicy,
        tieTreatment: 'escalate_on_exact_threshold',
        scoreAdjustments,
        explanations,
        computedAt: new Date().toISOString(),
      };
      this.repository.outcomes.put(
        actor.tenantId,
        recorded.outcomeId,
        clone(recorded),
      );
      if (outcome === 'accept') {
        proposal.status = ProposalStatus.ACCEPTED;
      } else if (outcome === 'reject') {
        proposal.status = ProposalStatus.REJECTED;
      }
      proposal.updatedAt = recorded.computedAt;
      this.audit(actor, 'aggregate_outcomes', recorded.outcomeId, {
        proposalId,
        proposalVersion: proposal.version,
        outcome,
        aggregateScore,
        quorum: dto.quorum,
        receivedReviews: currentReviews.length,
        missingReviews,
        calibrationPolicy: dto.calibrationPolicy,
        missingReviewPolicy: dto.missingReviewPolicy,
      });
      return this.outcomeView(recorded);
    });
  }

  async requestRevision(
    actor: ActorContext,
    proposalId: string,
    dto: RequestRevisionDto,
  ): Promise<Record<string, unknown>> {
    return this.mutate(actor, 'request_revision', dto, () => {
      const proposal = this.require(
        this.repository.proposals,
        actor.tenantId,
        proposalId,
      );
      this.assertOpenProposal(proposal);
      if (dto.proposalVersion !== proposal.version) {
        throw new BadRequestException('STALE_PROPOSAL_VERSION');
      }
      if (new Date(dto.deadline).getTime() <= Date.now()) {
        throw new BadRequestException('REVISION_DEADLINE_PAST');
      }
      if (
        this.repository.revisionRequests
          .values(actor.tenantId)
          .some(
            (request) =>
              request.proposalId === proposalId &&
              request.proposalVersion === proposal.version &&
              request.status === 'pending',
          )
      ) {
        throw new ConflictException('REVISION_ALREADY_PENDING');
      }
      const now = new Date().toISOString();
      const request: RevisionRequestRecord = {
        revisionRequestId: randomUUID(),
        tenantId: actor.tenantId,
        proposalId,
        proposalVersion: proposal.version,
        requesterId: actor.actorId,
        deadline: new Date(dto.deadline).toISOString(),
        instructions: dto.instructions,
        status: 'pending',
        responseVersion: null,
        createdAt: now,
        updatedAt: now,
      };
      this.repository.revisionRequests.put(
        actor.tenantId,
        request.revisionRequestId,
        clone(request),
      );
      proposal.status = ProposalStatus.IN_REVISION;
      proposal.updatedAt = now;
      this.audit(actor, 'request_revision', request.revisionRequestId, {
        proposalId,
        proposalVersion: proposal.version,
        deadline: request.deadline,
      });
      return this.revisionRequestView(request);
    });
  }

  async respondToRevision(
    actor: ActorContext,
    proposalId: string,
    revisionRequestId: string,
    dto: RespondToRevisionDto,
  ): Promise<Record<string, unknown>> {
    return this.mutate(actor, 'respond_to_revision', dto, () => {
      const proposal = this.require(
        this.repository.proposals,
        actor.tenantId,
        proposalId,
      );
      const request = this.require(
        this.repository.revisionRequests,
        actor.tenantId,
        revisionRequestId,
      );
      if (request.proposalId !== proposalId) {
        throw new NotFoundException('REVIEW_OUTCOMES_NOT_FOUND');
      }
      if (request.status !== 'pending') {
        throw new BadRequestException('REVISION_NOT_PENDING');
      }
      if (new Date(request.deadline).getTime() < Date.now()) {
        throw new BadRequestException('REVISION_DEADLINE_EXPIRED');
      }
      if (dto.newVersion !== proposal.version + 1) {
        throw new BadRequestException('INVALID_RESUBMISSION_VERSION');
      }
      const now = new Date().toISOString();
      const fromVersion = proposal.version;
      proposal.version = dto.newVersion;
      proposal.privatePayload = dto.privatePayload;
      proposal.status = ProposalStatus.SUBMITTED;
      proposal.updatedAt = now;
      request.status = 'answered';
      request.responseVersion = dto.newVersion;
      request.updatedAt = now;
      this.audit(actor, 'respond_to_revision', request.revisionRequestId, {
        proposalId,
        fromVersion,
        toVersion: dto.newVersion,
      });
      return {
        proposal: this.proposalView(proposal),
        revisionRequest: this.revisionRequestView(request),
      };
    });
  }

  async submitDeliverable(
    actor: ActorContext,
    milestoneId: string,
    dto: SubmitDeliverableDto,
  ): Promise<Record<string, unknown>> {
    return this.mutate(actor, 'submit_deliverable', dto, () => {
      if (dto.milestoneId !== milestoneId) {
        throw new BadRequestException('MILESTONE_MISMATCH');
      }
      if (dto.reviewerIds.includes(actor.actorId)) {
        throw new BadRequestException('SUBMITTER_CANNOT_REVIEW');
      }
      if (new Set(dto.reviewerIds).size !== dto.reviewerIds.length) {
        throw new BadRequestException('DUPLICATE_REVIEWERS');
      }
      if (new Set(dto.requirementIds).size !== dto.requirementIds.length) {
        throw new BadRequestException('DUPLICATE_REQUIREMENTS');
      }
      const latestVersion = this.repository.deliverables
        .values(actor.tenantId)
        .filter(
          (deliverable) =>
            deliverable.milestoneId === milestoneId &&
            deliverable.submitterId === actor.actorId,
        )
        .reduce(
          (maximum, deliverable) => Math.max(maximum, deliverable.version),
          0,
        );
      const now = new Date().toISOString();
      const deliverable: DeliverableRecord = {
        deliverableId: randomUUID(),
        tenantId: actor.tenantId,
        milestoneId,
        version: latestVersion + 1,
        submitterId: actor.actorId,
        kind: dto.kind,
        reference: dto.reference,
        checksum: dto.checksum ?? null,
        requirementIds: [...dto.requirementIds],
        reviewerIds: [...dto.reviewerIds],
        requiredApprovals: dto.requiredApprovals,
        status: DeliverableStatus.SUBMITTED,
        acceptCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      this.repository.deliverables.put(
        actor.tenantId,
        deliverable.deliverableId,
        clone(deliverable),
      );
      this.audit(actor, 'submit_deliverable', deliverable.deliverableId, {
        milestoneId,
        version: deliverable.version,
        requirementCount: deliverable.requirementIds.length,
        reviewerCount: deliverable.reviewerIds.length,
      });
      return this.deliverableView(deliverable);
    });
  }

  async reviewDeliverable(
    actor: ActorContext,
    milestoneId: string,
    deliverableId: string,
    dto: ReviewDeliverableDto,
  ): Promise<Record<string, unknown>> {
    return this.mutate(actor, 'review_deliverable', dto, () => {
      const deliverable = this.require(
        this.repository.deliverables,
        actor.tenantId,
        deliverableId,
      );
      if (deliverable.milestoneId !== milestoneId) {
        throw new NotFoundException('REVIEW_OUTCOMES_NOT_FOUND');
      }
      if (
        deliverable.status !== DeliverableStatus.SUBMITTED &&
        deliverable.status !== DeliverableStatus.CHANGES_REQUESTED
      ) {
        throw new BadRequestException('DELIVERABLE_FINALIZED');
      }
      if (deliverable.status === DeliverableStatus.CHANGES_REQUESTED) {
        throw new BadRequestException('DELIVERABLE_CHANGES_PENDING');
      }
      if (deliverable.submitterId === actor.actorId) {
        throw new ForbiddenException('SUBMITTER_CANNOT_REVIEW');
      }
      if (!deliverable.reviewerIds.includes(actor.actorId)) {
        throw new ForbiddenException('REVIEWER_NOT_DESIGNATED');
      }
      const latest = this.repository.deliverables
        .values(actor.tenantId)
        .filter(
          (candidate) =>
            candidate.milestoneId === milestoneId &&
            candidate.submitterId === deliverable.submitterId,
        )
        .reduce((current, candidate) =>
          candidate.version > current.version ? candidate : current,
        );
      if (latest.deliverableId !== deliverable.deliverableId) {
        throw new BadRequestException('DELIVERABLE_VERSION_NOT_CURRENT');
      }
      if (
        this.repository.deliverableReviews
          .values(actor.tenantId)
          .some(
            (review) =>
              review.deliverableId === deliverableId &&
              review.reviewerId === actor.actorId,
          )
      ) {
        throw new ConflictException('DELIVERABLE_REVIEW_ALREADY_SUBMITTED');
      }
      const scores = scoreMap(dto.rubricScores);
      if (
        Object.keys(scores).length !== deliverable.requirementIds.length ||
        !deliverable.requirementIds.every(
          (requirement) => requirement in scores,
        )
      ) {
        throw new BadRequestException('RUBRIC_MISMATCH');
      }
      const review: DeliverableReviewRecord = {
        reviewId: randomUUID(),
        tenantId: actor.tenantId,
        deliverableId,
        deliverableVersion: deliverable.version,
        reviewerId: actor.actorId,
        decision: dto.decision,
        rubricScores: scores,
        rationale: dto.rationale,
        createdAt: new Date().toISOString(),
      };
      this.repository.deliverableReviews.put(
        actor.tenantId,
        review.reviewId,
        clone(review),
      );
      if (dto.decision === DeliverableDecision.REJECT) {
        deliverable.status = DeliverableStatus.REJECTED;
      } else if (dto.decision === DeliverableDecision.REQUEST_CHANGES) {
        deliverable.status = DeliverableStatus.CHANGES_REQUESTED;
      } else {
        deliverable.acceptCount += 1;
        if (deliverable.acceptCount >= deliverable.requiredApprovals) {
          deliverable.status = DeliverableStatus.ACCEPTED;
        }
      }
      deliverable.updatedAt = review.createdAt;
      this.audit(actor, 'review_deliverable', review.reviewId, {
        deliverableId,
        milestoneId,
        version: deliverable.version,
        decision: dto.decision,
        acceptCount: deliverable.acceptCount,
      });
      return {
        deliverable: this.deliverableView(deliverable),
        review: this.deliverableReviewView(review),
      };
    });
  }

  async listAudit(actor: ActorContext): Promise<AuditEntry[]> {
    this.authorize(actor, 'list_audit');
    return await Promise.resolve(this.repository.listAudit(actor.tenantId));
  }

  private async mutate<T extends Record<string, unknown>>(
    actor: ActorContext,
    operation: Operation,
    request: MutatingRequest,
    work: () => T,
  ): Promise<T & { replayed: boolean }> {
    return this.repository.lock.runExclusive(actor.tenantId, () => {
      this.authorize(actor, operation);
      const key = `${actor.actorId}:${operation}:${request.idempotencyKey}`;
      const fingerprint = requestFingerprint({
        ...request,
        idempotencyKey: undefined,
      });
      const existing = this.repository.idempotency.get(actor.tenantId, key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new ConflictException('IDEMPOTENCY_KEY_REUSE');
        }
        return { ...clone(existing.result), replayed: true } as T & {
          replayed: boolean;
        };
      }
      const result = work();
      this.repository.idempotency.put(actor.tenantId, key, {
        fingerprint,
        result: clone(result),
        createdAt: new Date().toISOString(),
      });
      return { ...result, replayed: false };
    });
  }

  private authorize(actor: ActorContext, operation: Operation): void {
    if (
      !actor ||
      !actor.tenantId ||
      !actor.actorId ||
      !Array.isArray(actor.roles) ||
      actor.roles.length === 0
    ) {
      throw new ForbiddenException('REVIEW_OUTCOMES_ACCESS_DENIED');
    }
    const allowed = OPERATION_ROLES[operation] ?? [];
    if (
      !actor.roles.some((role) => allowed.includes(role as ReviewOutcomeRole))
    ) {
      throw new ForbiddenException('REVIEW_OUTCOMES_ROLE_DENIED');
    }
  }

  private require<T>(store: TenantStore<T>, tenantId: string, id: string): T {
    const value = store.get(tenantId, id);
    if (!value) {
      throw new NotFoundException('REVIEW_OUTCOMES_NOT_FOUND');
    }
    return value;
  }

  private assertOpenProposal(proposal: ProposalRecord): void {
    if (
      proposal.status === ProposalStatus.ACCEPTED ||
      proposal.status === ProposalStatus.REJECTED
    ) {
      throw new BadRequestException('PROPOSAL_FINALIZED');
    }
  }

  private audit(
    actor: ActorContext,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): void {
    this.repository.addAudit({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      action,
      entityId,
      timestamp: new Date().toISOString(),
      metadata,
    });
  }

  private proposalView(proposal: ProposalRecord): Record<string, unknown> {
    return {
      proposalId: proposal.proposalId,
      tenantId: proposal.tenantId,
      version: proposal.version,
      status: proposal.status,
      criteria: [...proposal.criteria],
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
    };
  }

  private reviewView(review: ReviewRecord): Record<string, unknown> {
    return {
      reviewId: review.reviewId,
      proposalId: review.proposalId,
      proposalVersion: review.proposalVersion,
      reviewerId: review.reviewerId,
      scores: { ...review.scores },
      createdAt: review.createdAt,
    };
  }

  private outcomeView(outcome: OutcomeRecord): Record<string, unknown> {
    return {
      outcomeId: outcome.outcomeId,
      tenantId: outcome.tenantId,
      proposalId: outcome.proposalId,
      proposalVersion: outcome.proposalVersion,
      outcome: outcome.outcome,
      aggregateScore: outcome.aggregateScore,
      quorum: outcome.quorum,
      receivedReviews: outcome.receivedReviews,
      missingReviews: outcome.missingReviews,
      calibrationPolicy: outcome.calibrationPolicy,
      missingReviewPolicy: outcome.missingReviewPolicy,
      tieTreatment: outcome.tieTreatment,
      scoreAdjustments: clone(outcome.scoreAdjustments),
      explanations: [...outcome.explanations],
      computedAt: outcome.computedAt,
    };
  }

  private revisionRequestView(
    request: RevisionRequestRecord,
  ): Record<string, unknown> {
    return {
      revisionRequestId: request.revisionRequestId,
      proposalId: request.proposalId,
      proposalVersion: request.proposalVersion,
      requesterId: request.requesterId,
      deadline: request.deadline,
      status: request.status,
      responseVersion: request.responseVersion,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }

  private deliverableView(
    deliverable: DeliverableRecord,
  ): Record<string, unknown> {
    return {
      deliverableId: deliverable.deliverableId,
      tenantId: deliverable.tenantId,
      milestoneId: deliverable.milestoneId,
      version: deliverable.version,
      kind: deliverable.kind,
      status: deliverable.status,
      requirementIds: [...deliverable.requirementIds],
      reviewerIds: [...deliverable.reviewerIds],
      checksum: deliverable.checksum,
      requiredApprovals: deliverable.requiredApprovals,
      acceptCount: deliverable.acceptCount,
      createdAt: deliverable.createdAt,
      updatedAt: deliverable.updatedAt,
    };
  }

  private deliverableReviewView(
    review: DeliverableReviewRecord,
  ): Record<string, unknown> {
    return {
      reviewId: review.reviewId,
      deliverableId: review.deliverableId,
      deliverableVersion: review.deliverableVersion,
      reviewerId: review.reviewerId,
      decision: review.decision,
      rubricScores: { ...review.rubricScores },
      createdAt: review.createdAt,
    };
  }
}
