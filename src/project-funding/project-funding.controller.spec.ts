import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { ProjectFundingAuditService } from './project-funding-audit.service';
import { ProjectFundingController } from './project-funding.controller';
import { ProjectFundingRepository } from './project-funding.repository';
import { ProjectFundingRolesGuard } from './project-funding-roles.guard';
import { ProjectFundingService } from './project-funding.service';
import { ProjectFundingRole } from './entities';
import {
  intentDto,
  modelDto,
  planDto,
  reservationDto,
} from './project-funding.fixtures';

describe('ProjectFundingController (HTTP integration and authorization)', () => {
  let app: INestApplication;
  let audit: ProjectFundingAuditService;
  let role: ProjectFundingRole | string;
  let tenantHeader: string | undefined;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectFundingController],
      providers: [
        ProjectFundingService,
        ProjectFundingRepository,
        ProjectFundingAuditService,
        ProjectFundingRolesGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.use(
      (
        req: { user?: unknown; headers?: Record<string, unknown> },
        _res: unknown,
        next: () => void,
      ) => {
        req.user = {
          sub: 'actor-admin',
          id: 'actor-admin',
          email: 'admin@example.com',
          role,
        };
        if (tenantHeader === undefined) {
          delete req.headers?.['x-tenant-id'];
        } else if (req.headers) {
          req.headers['x-tenant-id'] = tenantHeader;
        }
        next();
      },
    );
    await app.init();
    audit = moduleRef.get(ProjectFundingAuditService);
    role = ProjectFundingRole.ADMIN;
    tenantHeader = 'tenant-alpha';
  });

  afterEach(async () => {
    await app.close();
  });

  it('runs the complete funding lifecycle over HTTP', async () => {
    const model = await request(app.getHttpServer())
      .post('/project-funding/funding-models')
      .send(modelDto())
      .expect(201);
    const plan = await request(app.getHttpServer())
      .post('/project-funding/budget-plans')
      .send(planDto())
      .expect(201);
    const reservation = await request(app.getHttpServer())
      .post('/project-funding/budget-reservations')
      .send(reservationDto())
      .expect(201);
    const intent = await request(app.getHttpServer())
      .post('/project-funding/escrow-intents')
      .send(intentDto())
      .expect(201);

    expect(model.body.id).toBe('model-project-1');
    expect(plan.body.totalMinor).toBe(600000);
    expect(plan.body.lines[0]).not.toHaveProperty('justification');
    expect(reservation.body.amountMinor).toBe(250000);
    expect(intent.body.intentId).toBe('intent-intent-request-1');

    const auditJson = JSON.stringify(audit.list());
    expect(audit.list()).toHaveLength(4);
    expect(auditJson).not.toContain('Field laptops');
    expect(auditJson).not.toContain('justification');
    expect(auditJson).not.toContain('payerId');
  });

  it('denies unsupported roles by default', async () => {
    role = ProjectFundingRole.STUDENT;
    await request(app.getHttpServer())
      .post('/project-funding/funding-models')
      .send(modelDto())
      .expect(403);
    await request(app.getHttpServer())
      .post('/project-funding/budget-plans')
      .send(planDto())
      .expect(403);
    await request(app.getHttpServer())
      .post('/project-funding/budget-reservations')
      .send(reservationDto())
      .expect(403);
    await request(app.getHttpServer())
      .post('/project-funding/escrow-intents')
      .send(intentDto())
      .expect(403);
  });

  it('requires a tenant boundary and rejects cross-tenant payloads', async () => {
    tenantHeader = undefined;
    await request(app.getHttpServer())
      .post('/project-funding/funding-models')
      .send(modelDto())
      .expect(403);

    tenantHeader = 'tenant-beta';
    await request(app.getHttpServer())
      .post('/project-funding/funding-models')
      .send(modelDto())
      .expect(403);
    expect(audit.list()).toHaveLength(0);
  });

  it('rejects invalid bodies with 400', async () => {
    await request(app.getHttpServer())
      .post('/project-funding/funding-models')
      .send({ ...modelDto(), requestId: 'bad id', committedAmountMinor: -1 })
      .expect(400);
  });

  it('replays idempotent mutations without a second audit entry', async () => {
    await request(app.getHttpServer())
      .post('/project-funding/funding-models')
      .send(modelDto())
      .expect(201);
    await request(app.getHttpServer())
      .post('/project-funding/budget-plans')
      .send(planDto())
      .expect(201);

    const first = await request(app.getHttpServer())
      .post('/project-funding/budget-reservations')
      .send(reservationDto())
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post('/project-funding/budget-reservations')
      .send(reservationDto())
      .expect(201);

    expect(replay.body.reservationId).toBe(first.body.reservationId);
    expect(replay.body.replayed).toBe(true);
    expect(audit.list()).toHaveLength(3);
  });

  it('documents all four operations in the generated OpenAPI document', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('test').setVersion('1').build(),
    );
    const paths = [
      '/project-funding/funding-models',
      '/project-funding/budget-plans',
      '/project-funding/budget-reservations',
      '/project-funding/escrow-intents',
    ];

    for (const path of paths) {
      expect(document.paths[path]?.post).toBeDefined();
      expect(document.paths[path]?.post.summary).toContain('CAPSTONE-');
    }
  });
});
