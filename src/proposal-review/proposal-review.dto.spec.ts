import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AssignReviewerDto,
  CreateProposalDto,
  CreateQueueDto,
  CreateRubricDto,
  SubmitReviewDto,
} from './dto/proposal-review.dto';
import { ReviewMode, ReviewRole } from './proposal-review.types';

const rubric = () => ({
  name: 'Community impact',
  criteria: [
    { key: 'impact', label: 'Impact', weight: 60, maxScore: 5 },
    { key: 'feasibility', label: 'Feasibility', weight: 40, maxScore: 5 },
  ],
  idempotencyKey: 'rubric-key-01',
});

const proposal = () => ({
  title: 'Clean water',
  summary: 'Public abstract',
  applicantName: 'Ada Lovelace',
  applicantEmail: 'ada@example.org',
  organizationIdentifier: 'ORG-123',
  idempotencyKey: 'proposal-key-01',
});

describe('proposal review DTO validation', () => {
  it('accepts valid mutation payloads', async () => {
    expect(await validate(plainToInstance(CreateRubricDto, rubric()))).toEqual(
      [],
    );
    expect(
      await validate(plainToInstance(CreateProposalDto, proposal())),
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(CreateQueueDto, {
          name: 'Blind queue',
          reviewMode: ReviewMode.BLINDED,
          rubricId: 'rubric-id',
          allowedReviewerRoles: [ReviewRole.REVIEWER],
          idempotencyKey: 'queue-key-01',
        }),
      ),
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(SubmitReviewDto, {
          proposalId: 'proposal-id',
          queueId: 'queue-id',
          scores: [{ criterionKey: 'impact', score: 4 }],
          idempotencyKey: 'review-key-01',
        }),
      ),
    ).toEqual([]);
  });

  it('rejects malformed idempotency keys and emails', async () => {
    expect(
      await validate(
        plainToInstance(CreateProposalDto, {
          ...proposal(),
          applicantEmail: 'not-an-email',
        }),
      ),
    ).not.toEqual([]);
    expect(
      await validate(
        plainToInstance(CreateRubricDto, {
          ...rubric(),
          idempotencyKey: 'short',
        }),
      ),
    ).not.toEqual([]);
  });

  it('validates nested rubric criteria and score entries', async () => {
    expect(
      await validate(
        plainToInstance(CreateRubricDto, {
          ...rubric(),
          criteria: [{ key: 'impact', label: '', weight: 60, maxScore: 5 }],
        }),
      ),
    ).not.toEqual([]);
    expect(
      await validate(
        plainToInstance(CreateQueueDto, {
          name: 'Queue',
          reviewMode: 'unknown',
          rubricId: 'rubric-id',
          allowedReviewerRoles: ['admin'],
          idempotencyKey: 'queue-key-01',
        }),
      ),
    ).not.toEqual([]);
    expect(
      await validate(
        plainToInstance(SubmitReviewDto, {
          proposalId: 'proposal-id',
          queueId: 'queue-id',
          scores: [{ criterionKey: 'impact', score: -1 }],
          idempotencyKey: 'review-key-01',
        }),
      ),
    ).not.toEqual([]);
  });

  it('rejects non-reviewer roles in queue assignments', async () => {
    const errors = await validate(
      plainToInstance(AssignReviewerDto, {
        queueId: 'queue-id',
        proposalId: 'proposal-id',
        reviewerId: 'reviewer-id',
        reviewerRoles: [ReviewRole.REVIEW_ADMIN],
        idempotencyKey: 'assign-key-01',
      }),
    );
    expect(errors).not.toEqual([]);
  });
});
