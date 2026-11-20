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
  CreateProposalDto,
  CreateQueueDto,
  CreateRevisionCycleDto,
  CreateRubricDto,
  SubmitReviewDto,
} from './dto/proposal-review.dto';
import { ProposalReviewRepository } from './proposal-review.repository';
import { ProposalReviewService } from './proposal-review.service';
import { ReviewActor, ReviewMode, ReviewRole } from './proposal-review.types';

const admin: ReviewActor = {
  tenantId: 'tenant-a',
  actorId: 'admin-1',
  roles: [ReviewRole.REVIEW_ADMIN],
};
const applicant: ReviewActor = {
  tenantId: 'tenant-a',
  actorId: 'applicant-1',
  roles: [ReviewRole.APPLICANT],
};
const reviewer: ReviewActor = {
  tenantId: 'tenant-a',
  actorId: 'reviewer-1',
  roles: [ReviewRole.REVIEWER],
};
const seniorReviewer: ReviewActor = {
  tenantId: 'tenant-a',
  actorId: 'senior-1',
  roles: [ReviewRole.SENIOR_REVIEWER],
};

const PRIVATE_NAME = 'Ada Lovelace';
const PRIVATE_EMAIL = 'ada.lovelace@example.org';
const PRIVATE_ORG = 'ORG-SECRET-42';
const PRIVATE_NOTE = 'confidential reviewer note do-not-leak';

const rubricDto: CreateRubricDto = {
  name: 'Impact rubric',
  criteria: [
    { key: 'impact', label: 'Impact', weight: 60, maxScore: 5 },
    { key: 'feasibility', label: 'Feasibility', weight: 40, maxScore: 5 },
  ],
  idempotencyKey: 'rubric-key-01',
};
const proposalDto: CreateProposalDto = {
  title: 'Clean water proposal',
  summary: `${PRIVATE_NAME} of ${PRIVATE_ORG} can be reached at ${PRIVATE_EMAIL}.`,
  applicantName: PRIVATE_NAME,
  applicantEmail: PRIVATE_EMAIL,
  organizationIdentifier: PRIVATE_ORG,
  idempotencyKey: 'proposal-key-01',
};
const queueDto: CreateQueueDto = {
  name: 'Blind queue',
  reviewMode: ReviewMode.BLINDED,
  rubricId: '',
  allowedReviewerRoles: [ReviewRole.REVIEWER],
  idempotencyKey: 'queue-key-01',
};

const reviewDto = (
  proposalId: string,
  queueId: string,
  idempotencyKey = 'review-key-01',
): SubmitReviewDto => ({
  proposalId,
  queueId,
  scores: [
    { criterionKey: 'impact', score: 5 },
    { criterionKey: 'feasibility', score: 3 },
  ],
  privateNotes: PRIVATE_NOTE,
  idempotencyKey,
});

describe('ProposalReviewService', () => {
  let repository: ProposalReviewRepository;
  let service: ProposalReviewService;
  let rubricId: string;
  let proposalId: string;
  let queueId: string;

  const assign = async (
    reviewerId: string,
    roles: ReviewRole[],
    idempotencyKey: string,
  ) =>
    service.assignReviewer(admin, {
      queueId,
      proposalId,
      reviewerId,
      reviewerRoles: roles,
      idempotencyKey,
    } as AssignReviewerDto);

  beforeEach(async () => {
    repository = new ProposalReviewRepository();
    service = new ProposalReviewService(repository);
    rubricId = (await service.createRubric(admin, rubricDto)).id;
    proposalId = (await service.createProposal(applicant, proposalDto)).id;
    queueId = (await service.createQueue(admin, { ...queueDto, rubricId })).id;
  });

  it('creates queues and rubrics with metadata-only responses', async () => {
    const queue = await service.createQueue(admin, {
      ...queueDto,
      rubricId,
      idempotencyKey: 'queue-key-02',
    });
    expect(queue.reviewMode).toBe(ReviewMode.BLINDED);
    expect(queue.allowedReviewerRoles).toEqual([ReviewRole.REVIEWER]);
    expect(JSON.stringify(queue)).not.toContain(PRIVATE_EMAIL);
    const rubric = service.getRubric(reviewer, rubricId);
    expect(rubric.criteria.reduce((sum, item) => sum + item.weight, 0)).toBe(
      100,
    );
  });

  it('rejects rubric weights that do not sum to 100', async () => {
    await expect(
      service.createRubric(admin, {
        ...rubricDto,
        idempotencyKey: 'rubric-key-02',
        criteria: [{ ...rubricDto.criteria[0], weight: 99 }],
      }),
    ).rejects.toBeInstanceOf(BusinessRuleException);
  });

  it('rejects duplicate rubric criterion keys', async () => {
    await expect(
      service.createRubric(admin, {
        ...rubricDto,
        idempotencyKey: 'rubric-key-02',
        criteria: [
          { key: 'impact', label: 'Impact', weight: 50, maxScore: 5 },
          { key: 'impact', label: 'Impact again', weight: 50, maxScore: 5 },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationDomainException);
  });

  it('scopes queue assignment to the roles allowed by the queue', async () => {
    await expect(
      assign(
        seniorReviewer.actorId,
        [ReviewRole.SENIOR_REVIEWER],
        'assign-key-01',
      ),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    await expect(
      assign(reviewer.actorId, [ReviewRole.REVIEWER], 'assign-key-02'),
    ).resolves.toMatchObject({ id: queueId });
  });

  it('records one independent review per proposal and allows an explicit revision cycle', async () => {
    await assign(reviewer.actorId, [ReviewRole.REVIEWER], 'assign-key-02');
    const first = await service.submitReview(
      reviewer,
      reviewDto(proposalId, queueId),
    );
    expect(first.weightedScore).toBe(84);
    expect(first.revisionCycleId).toBeUndefined();

    await expect(
      service.submitReview(
        reviewer,
        reviewDto(proposalId, queueId, 'review-key-02'),
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_REVIEW_ALREADY_EXISTS });

    const cycle: CreateRevisionCycleDto = {
      proposalId,
      cycleLabel: 'Revision requested by committee',
      round: 2,
      idempotencyKey: 'cycle-key-01',
    };
    const revisionCycle = await service.createRevisionCycle(admin, cycle);
    const second = await service.submitReview(reviewer, {
      ...reviewDto(proposalId, queueId, 'review-key-02'),
      revisionCycleId: revisionCycle.id,
    });
    expect(second.id).not.toBe(first.id);
    expect(second.revisionCycleId).toBe(revisionCycle.id);
    await expect(
      service.submitReview(reviewer, {
        ...reviewDto(proposalId, queueId, 'review-key-03'),
        revisionCycleId: revisionCycle.id,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_REVIEW_ALREADY_EXISTS });
  });

  it('strips applicant name, email, and organization identifiers in blinded mode', async () => {
    await assign(reviewer.actorId, [ReviewRole.REVIEWER], 'assign-key-02');
    const cards = service.listQueueProposals(reviewer, queueId);
    expect(cards).toHaveLength(1);
    const serialized = JSON.stringify(cards);
    for (const secret of [PRIVATE_NAME, PRIVATE_EMAIL, PRIVATE_ORG]) {
      expect(serialized).not.toContain(secret);
    }
    expect(cards[0].summary).toContain('[redacted]');
    expect(cards[0]).not.toHaveProperty('applicantName');
    expect(cards[0]).not.toHaveProperty('applicantEmail');
    expect(cards[0]).not.toHaveProperty('organizationIdentifier');
  });

  it('includes identity only in explicitly open review mode', async () => {
    const openQueue = await service.createQueue(admin, {
      ...queueDto,
      rubricId,
      reviewMode: ReviewMode.OPEN,
      idempotencyKey: 'queue-key-02',
    });
    await service.assignReviewer(admin, {
      queueId: openQueue.id,
      proposalId,
      reviewerId: reviewer.actorId,
      reviewerRoles: [ReviewRole.REVIEWER],
      idempotencyKey: 'assign-key-02',
    });
    const card = service.listQueueProposals(reviewer, openQueue.id)[0];
    expect(card.applicantName).toBe(PRIVATE_NAME);
    expect(card.applicantEmail).toBe(PRIVATE_EMAIL);
    expect(card.organizationIdentifier).toBe(PRIVATE_ORG);
  });

  it('denies authorization by default and enforces tenant boundaries', async () => {
    await expect(
      service.createQueue(applicant, queueDto),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    await expect(
      service.createRubric(reviewer, rubricDto),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    await expect(
      service.submitReview(
        {
          tenantId: 'tenant-a',
          actorId: 'auditor-1',
          roles: [ReviewRole.AUDITOR],
        },
        reviewDto(proposalId, queueId),
      ),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    await expect(
      service.createQueue(
        { tenantId: 'tenant-a', actorId: 'unknown', roles: ['superuser'] },
        queueDto,
      ),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    await expect(
      service.createQueue({ ...admin, tenantId: '' }, queueDto),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);

    const otherTenant: ReviewActor = {
      tenantId: 'tenant-b',
      actorId: 'admin-b',
      roles: [ReviewRole.REVIEW_ADMIN],
    };
    expect(() => service.getRubric(otherTenant, rubricId)).toThrow(
      ResourceNotFoundException,
    );
    expect(() => service.listQueueProposals(otherTenant, queueId)).toThrow(
      ResourceNotFoundException,
    );
    expect(service.listAudit(otherTenant)).toEqual([]);
    await expect(
      service.submitReview(
        { ...reviewer, tenantId: 'tenant-b' },
        reviewDto(proposalId, queueId),
      ),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('records audit metadata only and never exposes private payloads', async () => {
    await assign(reviewer.actorId, [ReviewRole.REVIEWER], 'assign-key-02');
    const review = await service.submitReview(
      reviewer,
      reviewDto(proposalId, queueId),
    );
    const reviews = service.listReviews(reviewer);
    expect(JSON.stringify(review)).not.toContain(PRIVATE_NOTE);
    expect(JSON.stringify(reviews)).not.toContain(PRIVATE_NOTE);
    const audit = service.listAudit(admin);
    const serialized = JSON.stringify(audit);
    for (const secret of [
      PRIVATE_NAME,
      PRIVATE_EMAIL,
      PRIVATE_ORG,
      PRIVATE_NOTE,
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(audit.some((entry) => entry.action === 'review.submitted')).toBe(
      true,
    );
    for (const entry of audit) {
      expect(Object.keys(entry).sort()).toEqual(
        [
          'action',
          'actorId',
          'at',
          'entityId',
          'entityType',
          'id',
          'idempotencyKey',
          'tenantId',
        ].sort(),
      );
    }
    const idempotency = [...repository.store('tenant-a').idempotency.values()];
    expect(JSON.stringify(idempotency)).not.toContain(PRIVATE_NOTE);
    expect(JSON.stringify(idempotency)).not.toContain(PRIVATE_NAME);
  });

  it('replays idempotent requests and detects key reuse', async () => {
    await assign(reviewer.actorId, [ReviewRole.REVIEWER], 'assign-key-02');
    const input = reviewDto(proposalId, queueId);
    const first = await service.submitReview(reviewer, input);
    const replay = await service.submitReview(reviewer, { ...input });
    expect(replay.id).toBe(first.id);
    expect(repository.store('tenant-a').reviews.size).toBe(1);

    await expect(
      service.submitReview(reviewer, {
        ...input,
        idempotencyKey: 'review-key-02',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleException);

    await assign('reviewer-2', [ReviewRole.REVIEWER], 'assign-key-03');
    await expect(
      service.submitReview(
        { ...reviewer, actorId: 'reviewer-2' },
        { ...input, idempotencyKey: 'review-key-01' },
      ),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BIZ_IDEMPOTENCY_KEY_REUSED,
    });

    await expect(
      service.submitReview(reviewer, {
        ...input,
        scores: [
          { criterionKey: 'impact', score: 4 },
          { criterionKey: 'feasibility', score: 3 },
        ],
      }),
    ).rejects.toBeInstanceOf(ResourceConflictException);

    await expect(
      service.submitReview({ ...reviewer, tenantId: 'tenant-b' }, input),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('serializes concurrent retries of the same idempotency key', async () => {
    await assign(reviewer.actorId, [ReviewRole.REVIEWER], 'assign-key-02');
    const input = reviewDto(proposalId, queueId);
    const [first, second] = await Promise.all([
      service.submitReview(reviewer, input),
      service.submitReview(reviewer, { ...input }),
    ]);
    expect(first.id).toBe(second.id);
    expect(repository.store('tenant-a').reviews.size).toBe(1);
    expect(repository.store('tenant-a').audit).toHaveLength(5);
  });
});
