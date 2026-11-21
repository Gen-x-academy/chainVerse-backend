import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ProposalReviewController } from './proposal-review.controller';
import { ProposalReviewRepository } from './proposal-review.repository';
import { ProposalReviewService } from './proposal-review.service';
import { ReviewMode, ReviewRole } from './proposal-review.types';

const TENANT = 'tenant-a';
const NAME = 'Grace Hopper';
const EMAIL = 'grace@example.org';
const ORG = 'ORG-PRIVATE-9';
const NOTE = 'do-not-expose-this-note';

const actor = (actorId: string, roles: ReviewRole[]) => ({
  'x-tenant-id': TENANT,
  'x-actor-id': actorId,
  'x-actor-roles': roles.join(','),
});

describe('Proposal Review HTTP integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ProposalReviewController],
      providers: [ProposalReviewService, ProposalReviewRepository],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const admin = actor('admin-1', [ReviewRole.REVIEW_ADMIN]);
  const applicant = actor('applicant-1', [ReviewRole.APPLICANT]);
  const reviewer = actor('reviewer-1', [ReviewRole.REVIEWER]);

  it('rejects invalid payloads and actor contexts before mutations', async () => {
    await request(app.getHttpServer())
      .post('/proposal-review/rubrics')
      .set(admin)
      .send({
        name: 'Bad rubric',
        criteria: [{ key: 'impact', label: 'Impact', weight: 30, maxScore: 5 }],
        idempotencyKey: 'short',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/proposal-review/queues')
      .set({ 'x-tenant-id': TENANT })
      .send({
        name: 'Queue',
        reviewMode: ReviewMode.OPEN,
        rubricId: 'rubric-id',
        allowedReviewerRoles: [ReviewRole.REVIEWER],
        idempotencyKey: 'queue-key-01',
      })
      .expect(403);
  });

  it('serves the full blinded workflow without leaking private payloads', async () => {
    const rubric = await request(app.getHttpServer())
      .post('/proposal-review/rubrics')
      .set(admin)
      .send({
        name: 'Impact rubric',
        criteria: [
          { key: 'impact', label: 'Impact', weight: 60, maxScore: 5 },
          { key: 'feasibility', label: 'Feasibility', weight: 40, maxScore: 5 },
        ],
        idempotencyKey: 'rubric-key-01',
      })
      .expect(201);

    const proposal = await request(app.getHttpServer())
      .post('/proposal-review/proposals')
      .set(applicant)
      .send({
        title: 'Water project',
        summary: `${NAME} from ${ORG} is reachable at ${EMAIL}.`,
        applicantName: NAME,
        applicantEmail: EMAIL,
        organizationIdentifier: ORG,
        idempotencyKey: 'proposal-key-01',
      })
      .expect(201);
    expect(JSON.stringify(proposal.body)).not.toContain(NAME);

    const queue = await request(app.getHttpServer())
      .post('/proposal-review/queues')
      .set(admin)
      .send({
        name: 'Blind queue',
        reviewMode: ReviewMode.BLINDED,
        rubricId: rubric.body.id,
        allowedReviewerRoles: [ReviewRole.REVIEWER],
        idempotencyKey: 'queue-key-01',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/proposal-review/queues/${queue.body.id}/assignments`)
      .set(admin)
      .send({
        proposalId: proposal.body.id,
        reviewerId: 'reviewer-1',
        reviewerRoles: [ReviewRole.REVIEWER],
        idempotencyKey: 'assign-key-01',
      })
      .expect(201);

    const cards = await request(app.getHttpServer())
      .get(`/proposal-review/queues/${queue.body.id}/proposals`)
      .set(reviewer)
      .expect(200);
    for (const secret of [NAME, EMAIL, ORG]) {
      expect(JSON.stringify(cards.body)).not.toContain(secret);
    }

    const reviewBody = {
      proposalId: proposal.body.id,
      queueId: queue.body.id,
      scores: [
        { criterionKey: 'impact', score: 5 },
        { criterionKey: 'feasibility', score: 4 },
      ],
      privateNotes: NOTE,
      idempotencyKey: 'review-key-01',
    };
    const review = await request(app.getHttpServer())
      .post('/proposal-review/reviews')
      .set(reviewer)
      .send(reviewBody)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post('/proposal-review/reviews')
      .set(reviewer)
      .send(reviewBody)
      .expect(201);
    expect(replay.body.id).toBe(review.body.id);

    await request(app.getHttpServer())
      .post('/proposal-review/reviews')
      .set(reviewer)
      .send({ ...reviewBody, idempotencyKey: 'review-key-02' })
      .expect(422);

    const reviews = await request(app.getHttpServer())
      .get('/proposal-review/reviews')
      .set(reviewer)
      .expect(200);
    expect(JSON.stringify(reviews.body)).not.toContain(NOTE);

    const audit = await request(app.getHttpServer())
      .get('/proposal-review/audit')
      .set(admin)
      .expect(200);
    for (const secret of [NAME, EMAIL, ORG, NOTE]) {
      expect(JSON.stringify(audit.body)).not.toContain(secret);
    }
    expect(
      audit.body.some(
        (entry: { action: string }) => entry.action === 'review.submitted',
      ),
    ).toBe(true);
  });
});
