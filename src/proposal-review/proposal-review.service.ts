import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { ErrorCode } from '../common/errors/error-codes.enum';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../common/errors/domain.exception';
import {
  AssignReviewerDto,
  AuditViewDto,
  CreateProposalDto,
  CreateQueueDto,
  CreateRevisionCycleDto,
  CreateRubricDto,
  ProposalViewDto,
  QueueViewDto,
  ReviewerProposalViewDto,
  ReviewViewDto,
  RevisionCycleViewDto,
  RubricViewDto,
  SubmitReviewDto,
} from './dto/proposal-review.dto';
import {
  ProposalReviewRepository,
  ProposalRecord,
  QueueRecord,
  ReviewRecord,
  TenantStore,
} from './proposal-review.repository';
import {
  ADMIN_ROLES,
  ALL_ROLES,
  ReviewActor,
  ReviewRole,
  REVIEWER_ROLES,
  ReviewMode,
} from './proposal-review.types';

@Injectable()
export class ProposalReviewService {
  constructor(private readonly repository: ProposalReviewRepository) {}

  async createProposal(
    actor: ReviewActor,
    dto: CreateProposalDto,
  ): Promise<ProposalViewDto> {
    const context = this.actor(actor);
    this.authorize(context, [ReviewRole.APPLICANT]);
    const input = await this.valid(CreateProposalDto, dto);
    return this.mutate(context, 'proposal.create', input, () => {
      const store = this.store(context);
      const proposal: ProposalRecord = {
        id: this.id(),
        tenantId: context.tenantId,
        ownerActorId: context.actorId,
        title: input.title,
        summary: input.summary,
        applicantName: input.applicantName,
        applicantEmail: input.applicantEmail,
        organizationIdentifier: input.organizationIdentifier,
        createdAt: new Date().toISOString(),
      };
      store.proposals.set(proposal.id, proposal);
      this.audit(
        context,
        input.idempotencyKey,
        'proposal.created',
        'proposal',
        proposal.id,
      );
      return { id: proposal.id, title: proposal.title };
    });
  }

  async createRubric(
    actor: ReviewActor,
    dto: CreateRubricDto,
  ): Promise<RubricViewDto> {
    const context = this.actor(actor);
    this.authorize(context, ADMIN_ROLES);
    const input = await this.valid(CreateRubricDto, dto);
    const keys = input.criteria.map((criterion) => criterion.key);
    if (new Set(keys).size !== keys.length) {
      throw new ValidationDomainException(
        'Rubric criterion keys must be unique',
        ErrorCode.VAL_INVALID_INPUT,
        { fields: ['criteria'] },
      );
    }
    const total = input.criteria.reduce(
      (sum, criterion) => sum + criterion.weight,
      0,
    );
    if (Math.abs(total - 100) > 1e-6) {
      throw new BusinessRuleException(
        'Rubric criterion weights must sum to 100',
        ErrorCode.VAL_RUBRIC_WEIGHTS_INVALID,
        { total },
      );
    }
    return this.mutate(context, 'rubric.create', input, () => {
      const store = this.store(context);
      const rubric = {
        id: this.id(),
        tenantId: context.tenantId,
        name: input.name,
        criteria: input.criteria.map((criterion) => ({ ...criterion })),
        createdAt: new Date().toISOString(),
      };
      store.rubrics.set(rubric.id, rubric);
      this.audit(
        context,
        input.idempotencyKey,
        'rubric.created',
        'rubric',
        rubric.id,
      );
      return {
        id: rubric.id,
        name: rubric.name,
        criteria: rubric.criteria.map((criterion) => ({ ...criterion })),
        createdAt: rubric.createdAt,
      };
    });
  }

  getRubric(actor: ReviewActor, rubricId: string): RubricViewDto {
    const context = this.actor(actor);
    this.authorize(context, [...REVIEWER_ROLES, ...ADMIN_ROLES]);
    const rubric = this.find(
      context,
      this.store(context).rubrics,
      rubricId,
      'rubric',
    );
    return {
      id: rubric.id,
      name: rubric.name,
      criteria: rubric.criteria.map((criterion) => ({ ...criterion })),
      createdAt: rubric.createdAt,
    };
  }

  async createQueue(
    actor: ReviewActor,
    dto: CreateQueueDto,
  ): Promise<QueueViewDto> {
    const context = this.actor(actor);
    this.authorize(context, ADMIN_ROLES);
    const input = await this.valid(CreateQueueDto, dto);
    this.find(context, this.store(context).rubrics, input.rubricId, 'rubric');
    return this.mutate(context, 'queue.create', input, () => {
      const store = this.store(context);
      const queue: QueueRecord = {
        id: this.id(),
        tenantId: context.tenantId,
        name: input.name,
        reviewMode: input.reviewMode,
        rubricId: input.rubricId,
        allowedReviewerRoles: [...input.allowedReviewerRoles],
        createdBy: context.actorId,
        createdAt: new Date().toISOString(),
      };
      store.queues.set(queue.id, queue);
      this.audit(
        context,
        input.idempotencyKey,
        'queue.created',
        'queue',
        queue.id,
      );
      return this.queueView(queue, store);
    });
  }

  listQueues(actor: ReviewActor): QueueViewDto[] {
    const context = this.actor(actor);
    this.authorize(context, [...REVIEWER_ROLES, ...ADMIN_ROLES]);
    const store = this.store(context);
    return [...store.queues.values()]
      .filter((queue) => queue.tenantId === context.tenantId)
      .map((queue) => this.queueView(queue, store));
  }

  async assignReviewer(
    actor: ReviewActor,
    dto: AssignReviewerDto,
  ): Promise<QueueViewDto> {
    const context = this.actor(actor);
    this.authorize(context, ADMIN_ROLES);
    const input = await this.valid(AssignReviewerDto, dto);
    const store = this.store(context);
    const queue = this.find(
      context,
      store.queues,
      String(input.queueId ?? ''),
      'queue',
    );
    this.find(context, store.proposals, input.proposalId, 'proposal');
    if (
      !input.reviewerRoles.some((role) =>
        queue.allowedReviewerRoles.includes(role),
      )
    ) {
      throw new ForbiddenDomainException(
        'Reviewer role is not permitted by this queue',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    const key = `${queue.id}:${input.proposalId}:${input.reviewerId}`;
    return this.repository.withLock(
      `${context.tenantId}:assignment:${key}`,
      () =>
        this.mutate(context, 'queue.assign', input, () => {
          if (store.assignments.has(key)) {
            throw new ResourceConflictException(
              'Reviewer is already assigned to this proposal in this queue',
              ErrorCode.RES_ALREADY_EXISTS,
            );
          }
          store.assignments.set(key, {
            key,
            tenantId: context.tenantId,
            queueId: queue.id,
            proposalId: input.proposalId,
            reviewerId: input.reviewerId,
            reviewerRoles: [...input.reviewerRoles],
            createdAt: new Date().toISOString(),
          });
          this.audit(
            context,
            input.idempotencyKey,
            'queue.reviewer-assigned',
            'queue',
            queue.id,
          );
          return this.queueView(queue, store);
        }),
    );
  }

  listQueueProposals(
    actor: ReviewActor,
    queueId: string,
  ): ReviewerProposalViewDto[] {
    const context = this.actor(actor);
    this.authorize(context, [...REVIEWER_ROLES, ...ADMIN_ROLES]);
    const store = this.store(context);
    const queue = this.find(context, store.queues, queueId, 'queue');
    const isAdmin = context.roles.some((role) => ADMIN_ROLES.includes(role));
    return [...store.assignments.values()]
      .filter(
        (assignment) =>
          assignment.queueId === queue.id &&
          assignment.tenantId === context.tenantId &&
          (isAdmin || assignment.reviewerId === context.actorId),
      )
      .map((assignment) => store.proposals.get(assignment.proposalId))
      .filter((proposal): proposal is ProposalRecord => Boolean(proposal))
      .map((proposal) => this.reviewerProposalView(proposal, queue.reviewMode));
  }

  async createRevisionCycle(
    actor: ReviewActor,
    dto: CreateRevisionCycleDto,
  ): Promise<RevisionCycleViewDto> {
    const context = this.actor(actor);
    this.authorize(context, ADMIN_ROLES);
    const input = await this.valid(CreateRevisionCycleDto, dto);
    const store = this.store(context);
    this.find(context, store.proposals, input.proposalId, 'proposal');
    const existing = [...store.cycles.values()].find(
      (cycle) =>
        cycle.proposalId === input.proposalId && cycle.round === input.round,
    );
    if (existing) {
      throw new ResourceConflictException(
        'Revision cycle already exists for this proposal and round',
        ErrorCode.RES_ALREADY_EXISTS,
      );
    }
    return this.mutate(context, 'revision-cycle.create', input, () => {
      const cycle = {
        id: this.id(),
        tenantId: context.tenantId,
        proposalId: input.proposalId,
        cycleLabel: input.cycleLabel,
        round: input.round,
        open: true,
      };
      store.cycles.set(cycle.id, cycle);
      this.audit(
        context,
        input.idempotencyKey,
        'revision-cycle.created',
        'proposal',
        cycle.id,
      );
      return { ...cycle };
    });
  }

  async submitReview(
    actor: ReviewActor,
    dto: SubmitReviewDto,
  ): Promise<ReviewViewDto> {
    const context = this.actor(actor);
    this.authorize(context, REVIEWER_ROLES);
    const input = await this.valid(SubmitReviewDto, dto);
    const store = this.store(context);
    const queue = this.find(context, store.queues, input.queueId, 'queue');
    const rubric = this.find(context, store.rubrics, queue.rubricId, 'rubric');
    const proposal = this.find(
      context,
      store.proposals,
      input.proposalId,
      'proposal',
    );
    if (proposal.ownerActorId === context.actorId) {
      throw new ForbiddenDomainException(
        'Applicant cannot review their own proposal',
        ErrorCode.BIZ_SEPARATION_OF_DUTIES,
      );
    }
    if (
      !store.assignments.has(`${queue.id}:${proposal.id}:${context.actorId}`)
    ) {
      throw new ForbiddenDomainException(
        'Reviewer is not assigned to this proposal in this queue',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    const cycle = input.revisionCycleId
      ? this.find(
          context,
          store.cycles,
          input.revisionCycleId,
          'revision-cycle',
        )
      : undefined;
    if (cycle && cycle.proposalId !== proposal.id) {
      throw new ValidationDomainException(
        'Revision cycle belongs to a different proposal',
        ErrorCode.VAL_INVALID_INPUT,
        { fields: ['revisionCycleId'] },
      );
    }
    if (cycle && !cycle.open) {
      throw new BusinessRuleException(
        'Revision cycle is closed',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }
    const cycleKey = cycle?.id ?? 'initial';
    this.assertScores(input.scores, rubric.criteria);
    return this.repository.withLock(
      `${context.tenantId}:review:${proposal.id}:${context.actorId}:${cycleKey}`,
      () =>
        this.mutate(context, 'review.submit', input, () => {
          const duplicate = [...store.reviews.values()].some(
            (review) =>
              review.proposalId === proposal.id &&
              review.reviewerId === context.actorId &&
              review.cycleKey === cycleKey,
          );
          if (duplicate) {
            throw new BusinessRuleException(
              'Only one independent review per proposal is allowed per cycle',
              ErrorCode.BIZ_REVIEW_ALREADY_EXISTS,
            );
          }
          const review: ReviewRecord = {
            id: this.id(),
            tenantId: context.tenantId,
            proposalId: proposal.id,
            reviewerId: context.actorId,
            queueId: queue.id,
            rubricId: rubric.id,
            cycleKey,
            revisionCycleId: cycle?.id,
            scores: input.scores.map((score) => ({ ...score })),
            privateNotes: input.privateNotes,
            weightedScore: this.weightedScore(input.scores, rubric.criteria),
            submittedAt: new Date().toISOString(),
          };
          store.reviews.set(review.id, review);
          this.audit(
            context,
            input.idempotencyKey,
            'review.submitted',
            'review',
            review.id,
          );
          return this.reviewView(review);
        }),
    );
  }

  listReviews(actor: ReviewActor): ReviewViewDto[] {
    const context = this.actor(actor);
    this.authorize(context, [...REVIEWER_ROLES, ...ADMIN_ROLES]);
    const store = this.store(context);
    const isAdmin = context.roles.some((role) => ADMIN_ROLES.includes(role));
    return [...store.reviews.values()]
      .filter(
        (review) =>
          review.tenantId === context.tenantId &&
          (isAdmin || review.reviewerId === context.actorId),
      )
      .map((review) => this.reviewView(review));
  }

  listAudit(actor: ReviewActor): AuditViewDto[] {
    const context = this.actor(actor);
    this.authorize(context, [...ADMIN_ROLES, ReviewRole.AUDITOR]);
    return this.repository
      .auditFor(context.tenantId)
      .map((entry) => ({ ...entry }));
  }

  private actor(value: ReviewActor): ReviewActor {
    const tenantId = String(value?.tenantId ?? '').trim();
    const actorId = String(value?.actorId ?? '').trim();
    const roles = Array.isArray(value?.roles)
      ? value.roles.map((role) => String(role).trim())
      : [];
    if (!tenantId || !actorId || roles.length === 0) {
      throw new ForbiddenDomainException(
        'Actor context is incomplete',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    return { tenantId, actorId, roles };
  }

  private authorize(actor: ReviewActor, allowed: readonly string[]): void {
    const granted = actor.roles.filter((role) => ALL_ROLES.includes(role));
    if (!granted.some((role) => allowed.includes(role))) {
      throw new ForbiddenDomainException(
        'Actor is not permitted to perform this operation',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
  }

  private store(actor: ReviewActor): TenantStore {
    return this.repository.store(actor.tenantId);
  }

  private find<T extends { tenantId: string; id: string }>(
    actor: ReviewActor,
    records: Map<string, T>,
    id: string,
    label: string,
  ): T {
    const record = records.get(id);
    if (!record || record.tenantId !== actor.tenantId) {
      throw new ResourceNotFoundException(
        `${label} not found`,
        ErrorCode.RES_NOT_FOUND,
      );
    }
    return record;
  }

  private async valid<T extends object>(
    type: new () => T,
    value: T,
  ): Promise<T> {
    const instance = plainToInstance(type, value ?? {});
    try {
      await validateOrReject(instance, {
        whitelist: true,
        forbidNonWhitelisted: true,
        stopAtFirstError: true,
      });
      return instance;
    } catch (errors) {
      const fields = Array.isArray(errors)
        ? errors.map(
            (error: { property?: string }) => error.property ?? 'request',
          )
        : ['request'];
      throw new ValidationDomainException(
        'Invalid proposal review request',
        ErrorCode.VAL_INVALID_INPUT,
        { fields },
      );
    }
  }

  private async mutate<T>(
    actor: ReviewActor,
    operation: string,
    dto: { idempotencyKey: string },
    work: () => T | Promise<T>,
  ): Promise<T> {
    const key = dto.idempotencyKey;
    const fingerprint = this.fingerprint(operation, dto);
    return this.repository.withLock(`${actor.tenantId}:${key}`, async () => {
      const store = this.store(actor);
      const previous = store.idempotency.get(key);
      if (previous) {
        if (
          previous.operation !== operation ||
          previous.fingerprint !== fingerprint ||
          previous.actorId !== actor.actorId
        ) {
          throw new ResourceConflictException(
            'Idempotency key reused for a different request',
            ErrorCode.BIZ_IDEMPOTENCY_KEY_REUSED,
          );
        }
        return previous.response as T;
      }
      const response = await work();
      store.idempotency.set(key, {
        key,
        operation,
        fingerprint,
        actorId: actor.actorId,
        response,
        at: new Date().toISOString(),
      });
      return response;
    });
  }

  private fingerprint(operation: string, body: object): string {
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      body as Record<string, unknown>,
    )) {
      if (key !== 'idempotencyKey') payload[key] = value;
    }
    return createHash('sha256')
      .update(`${operation}:${this.stable(payload)}`)
      .digest('hex');
  }

  private stable(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stable(item)).join(',')}]`;
    }
    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${this.stable(record[key])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
  }

  private id(): string {
    return createHash('sha256')
      .update(`${Date.now()}-${Math.random()}-${process.hrtime.bigint()}`)
      .digest('hex')
      .slice(0, 24);
  }

  private audit(
    actor: ReviewActor,
    idempotencyKey: string,
    action: string,
    entityType: string,
    entityId: string,
  ): void {
    this.repository.addAudit(actor.tenantId, {
      actorId: actor.actorId,
      action,
      entityType,
      entityId,
      idempotencyKey,
    });
  }

  private queueView(queue: QueueRecord, store: TenantStore): QueueViewDto {
    return {
      id: queue.id,
      name: queue.name,
      reviewMode: queue.reviewMode,
      rubricId: queue.rubricId,
      allowedReviewerRoles: [...queue.allowedReviewerRoles],
      assignedProposalIds: [...store.assignments.values()]
        .filter(
          (assignment) =>
            assignment.queueId === queue.id &&
            assignment.tenantId === queue.tenantId,
        )
        .map((assignment) => assignment.proposalId),
    };
  }

  private reviewerProposalView(
    proposal: ProposalRecord,
    reviewMode: ReviewMode,
  ): ReviewerProposalViewDto {
    const blinded = reviewMode === ReviewMode.BLINDED;
    return {
      id: proposal.id,
      title: blinded ? this.redact(proposal.title, proposal) : proposal.title,
      summary: blinded
        ? this.redact(proposal.summary, proposal)
        : proposal.summary,
      ...(blinded
        ? {}
        : {
            applicantName: proposal.applicantName,
            applicantEmail: proposal.applicantEmail,
            organizationIdentifier: proposal.organizationIdentifier,
          }),
    };
  }

  private redact(text: string, proposal: ProposalRecord): string {
    let result = text;
    for (const value of [
      proposal.applicantName,
      proposal.applicantEmail,
      proposal.organizationIdentifier,
    ]) {
      if (!value) continue;
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'gi'), '[redacted]');
    }
    return result;
  }

  private reviewView(review: ReviewRecord): ReviewViewDto {
    return {
      id: review.id,
      proposalId: review.proposalId,
      reviewerId: review.reviewerId,
      queueId: review.queueId,
      rubricId: review.rubricId,
      ...(review.revisionCycleId
        ? { revisionCycleId: review.revisionCycleId }
        : {}),
      weightedScore: review.weightedScore,
      submittedAt: review.submittedAt,
    };
  }

  private assertScores(
    scores: SubmitReviewDto['scores'],
    criteria: { key: string; maxScore: number }[],
  ): void {
    const keys = scores.map((score) => score.criterionKey);
    const unique = new Set(keys);
    if (
      unique.size !== keys.length ||
      keys.length !== criteria.length ||
      criteria.some((criterion) => !unique.has(criterion.key))
    ) {
      throw new ValidationDomainException(
        'Scores must cover each rubric criterion exactly once',
        ErrorCode.VAL_INVALID_INPUT,
        { fields: ['scores'] },
      );
    }
    for (const score of scores) {
      const criterion = criteria.find(
        (item) => item.key === score.criterionKey,
      );
      if (
        !criterion ||
        !Number.isFinite(score.score) ||
        score.score < 0 ||
        score.score > criterion.maxScore
      ) {
        throw new ValidationDomainException(
          'Criterion score is outside the permitted range',
          ErrorCode.VAL_OUT_OF_RANGE,
          { fields: [score.criterionKey] },
        );
      }
    }
  }

  private weightedScore(
    scores: SubmitReviewDto['scores'],
    criteria: { key: string; maxScore: number; weight: number }[],
  ): number {
    const total = criteria.reduce((sum, criterion) => {
      const score = scores.find((item) => item.criterionKey === criterion.key);
      return (
        sum + ((score?.score ?? 0) / criterion.maxScore) * criterion.weight
      );
    }, 0);
    return Math.round(total * 100) / 100;
  }
}
