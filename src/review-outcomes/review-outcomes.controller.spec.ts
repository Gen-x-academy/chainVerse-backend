import {
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ReviewOutcomesController } from './review-outcomes.controller';
import { ReviewOutcomesAccessGuard } from './review-outcomes-access.guard';
import { ReviewOutcomesRepository } from './review-outcomes.repository';
import { ReviewOutcomesService } from './review-outcomes.service';

function headers(roles: string, sub = 'user-a', tenant = 'tenant-a') {
  return {
    'x-test-roles': roles,
    'x-test-sub': sub,
    'x-test-tenant': tenant,
  };
}

const authGuard = {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: Record<string, unknown>;
    }>();
    const sub = req.headers['x-test-sub'];
    const tenantId = req.headers['x-test-tenant'];
    const roles = req.headers['x-test-roles'];
    if (!sub || !tenantId || !roles) {
      throw new ForbiddenException('TEST_AUTH_DENIED');
    }
    req.user = {
      sub,
      id: sub,
      tenantId,
      roles: roles.split(',').filter(Boolean),
    };
    return true;
  },
};

describe('ReviewOutcomesController (HTTP integration)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReviewOutcomesController],
      providers: [
        ReviewOutcomesService,
        ReviewOutcomesRepository,
        ReviewOutcomesAccessGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('validates request bodies and rejects unknown fields', async () => {
    await request(server)
      .post('/review-outcomes/proposals')
      .set(headers('submitter'))
      .send({
        idempotencyKey: 'http-invalid',
        privatePayload: 'secret',
        criteria: [],
      })
      .expect(400);

    await request(server)
      .post('/review-outcomes/proposals')
      .set(headers('submitter'))
      .send({
        idempotencyKey: 'http-invalid-extra',
        privatePayload: 'secret',
        criteria: ['quality'],
        unexpected: 'value',
      })
      .expect(400);
  });

  it('denies unauthorized roles and missing tenant claims', async () => {
    await request(server)
      .post('/review-outcomes/proposals')
      .set(headers('student'))
      .send({
        idempotencyKey: 'http-role-denied',
        privatePayload: 'secret',
        criteria: ['quality'],
      })
      .expect(403);

    await request(server)
      .post('/review-outcomes/proposals')
      .set({ 'x-test-roles': 'submitter', 'x-test-sub': 'user-a' })
      .send({
        idempotencyKey: 'http-tenant-denied',
        privatePayload: 'secret',
        criteria: ['quality'],
      })
      .expect(403);
  });

  it('replays an idempotent retry without duplicating state', async () => {
    const payload = {
      idempotencyKey: 'http-idempotent',
      privatePayload: 'SECRET_HTTP_PROPOSAL',
      criteria: ['quality'],
    };
    const first = await request(server)
      .post('/review-outcomes/proposals')
      .set(headers('submitter'))
      .send(payload)
      .expect(201);
    const retry = await request(server)
      .post('/review-outcomes/proposals')
      .set(headers('submitter'))
      .send(payload)
      .expect(201);

    expect(retry.body.proposalId).toBe(first.body.proposalId);
    expect(retry.body.replayed).toBe(true);
    expect(JSON.stringify(first.body)).not.toContain('SECRET_HTTP_PROPOSAL');
  });

  it('enforces tenant boundaries over HTTP', async () => {
    const created = await request(server)
      .post('/review-outcomes/proposals')
      .set(headers('submitter'))
      .send({
        idempotencyKey: 'http-tenant-proposal',
        privatePayload: 'SECRET',
        criteria: ['quality'],
      })
      .expect(201);

    await request(server)
      .post(`/review-outcomes/proposals/${created.body.proposalId}/reviews`)
      .set(headers('reviewer', 'reviewer-b', 'tenant-b'))
      .send({
        idempotencyKey: 'http-cross-tenant-review',
        proposalVersion: 1,
        scores: [{ criterion: 'quality', score: 90 }],
      })
      .expect(404);
  });

  it('runs all four workflows through validated HTTP endpoints', async () => {
    const proposal = await request(server)
      .post('/review-outcomes/proposals')
      .set(headers('submitter'))
      .send({
        idempotencyKey: 'http-proposal',
        privatePayload: 'SECRET_PROPOSAL_HTTP',
        criteria: ['quality'],
      })
      .expect(201);
    const proposalId = proposal.body.proposalId as string;

    await request(server)
      .post(`/review-outcomes/proposals/${proposalId}/reviews`)
      .set(headers('reviewer', 'reviewer-http'))
      .send({
        idempotencyKey: 'http-review',
        proposalVersion: 1,
        scores: [{ criterion: 'quality', score: 85 }],
        comment: 'SECRET_COMMENT_HTTP',
      })
      .expect(201);

    const revision = await request(server)
      .post(`/review-outcomes/proposals/${proposalId}/revision-requests`)
      .set(headers('coordinator', 'coordinator-http'))
      .send({
        idempotencyKey: 'http-revision-request',
        proposalVersion: 1,
        deadline: new Date(Date.now() + 120_000).toISOString(),
        instructions: 'SECRET_INSTRUCTIONS_HTTP',
      })
      .expect(201);

    await request(server)
      .post(
        `/review-outcomes/proposals/${proposalId}/revision-requests/${revision.body.revisionRequestId}/responses`,
      )
      .set(headers('submitter'))
      .send({
        idempotencyKey: 'http-revision-response',
        newVersion: 2,
        privatePayload: 'SECRET_REVISED_PROPOSAL_HTTP',
      })
      .expect(201);

    await request(server)
      .post(`/review-outcomes/proposals/${proposalId}/reviews`)
      .set(headers('reviewer', 'reviewer-http'))
      .send({
        idempotencyKey: 'http-review-v2',
        proposalVersion: 2,
        scores: [{ criterion: 'quality', score: 85 }],
        comment: 'SECRET_COMMENT_V2_HTTP',
      })
      .expect(201);

    const aggregate = await request(server)
      .post(`/review-outcomes/proposals/${proposalId}/outcomes`)
      .set(headers('coordinator', 'coordinator-http'))
      .send({
        idempotencyKey: 'http-aggregate',
        quorum: 1,
        acceptanceThreshold: 80,
        calibrationPolicy: 'none',
        missingReviewPolicy: 'abstain',
      })
      .expect(201);
    expect(aggregate.body.outcome).toBe('accept');
    expect(aggregate.body.proposalVersion).toBe(2);

    const deliverable = await request(server)
      .post('/review-outcomes/milestones/milestone-http/deliverables')
      .set(headers('submitter'))
      .send({
        idempotencyKey: 'http-deliverable',
        milestoneId: 'milestone-http',
        kind: 'link',
        reference: 'SECRET_REFERENCE_HTTP',
        reviewerIds: ['reviewer-http'],
        requirementIds: ['requirement-http'],
        requiredApprovals: 1,
      })
      .expect(201);

    const decision = await request(server)
      .post(
        `/review-outcomes/milestones/milestone-http/deliverables/${deliverable.body.deliverableId}/reviews`,
      )
      .set(headers('reviewer', 'reviewer-http'))
      .send({
        idempotencyKey: 'http-decision',
        decision: 'accept',
        rubricScores: [{ criterion: 'requirement-http', score: 95 }],
        rationale: 'SECRET_RATIONALE_HTTP',
      })
      .expect(201);
    expect(decision.body.deliverable.status).toBe('accepted');

    const audit = await request(server)
      .get('/review-outcomes/audit')
      .set(headers('coordinator', 'coordinator-http'))
      .expect(200);
    const serialized = JSON.stringify(audit.body);
    for (const secret of [
      'SECRET_PROPOSAL_HTTP',
      'SECRET_COMMENT_HTTP',
      'SECRET_INSTRUCTIONS_HTTP',
      'SECRET_REVISED_PROPOSAL_HTTP',
      'SECRET_COMMENT_V2_HTTP',
      'SECRET_REFERENCE_HTTP',
      'SECRET_RATIONALE_HTTP',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });
});
