import { ConfigService } from '@nestjs/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SessionService } from '../session/session.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PlanningAuditService } from './project-planning-audit.service';
import { ProjectPlanningController } from './project-planning.controller';
import { ProjectPlanningRepository } from './project-planning.repository';
import { ProjectPlanningService } from './project-planning.service';
import { PlanningRole } from './project-planning.types';

const secret = 'integration-test-secret-at-least-32-chars';

describe('ProjectPlanningController auth and integration', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret, signOptions: { algorithm: 'HS256' } }),
      ],
      controllers: [ProjectPlanningController],
      providers: [
        ProjectPlanningService,
        ProjectPlanningRepository,
        PlanningAuditService,
        JwtAuthGuard,
        RolesGuard,
        { provide: ConfigService, useValue: { get: () => secret } },
        { provide: SessionService, useValue: {} },
        { provide: Reflector, useValue: new Reflector() },
      ],
    }).compile();

    jwt = moduleRef.get(JwtService);
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function token(sub: string, role: string): string {
    return jwt.sign({ sub, email: `${sub}@example.com`, role });
  }

  async function createProject(
    tenantId: string,
    idempotencyKey: string,
    sub = 'owner',
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`/planning/tenants/${tenantId}/projects`)
      .set('Authorization', `Bearer ${token(sub, 'admin')}`)
      .send({
        idempotencyKey,
        name: 'Apollo',
        deadline: '2026-12-31T00:00:00.000Z',
      })
      .expect(201);
    return response.body.id;
  }

  it('denies unauthenticated and insufficiently privileged actors', async () => {
    await request(app.getHttpServer())
      .post('/planning/tenants/tenant-a/projects')
      .send({
        idempotencyKey: 'key-unauth-0001',
        name: 'X',
        deadline: '2026-12-31T00:00:00.000Z',
      })
      .expect(401);

    await request(app.getHttpServer())
      .post('/planning/tenants/tenant-a/projects')
      .set('Authorization', `Bearer ${token('student', 'student')}`)
      .send({
        idempotencyKey: 'key-student-0001',
        name: 'X',
        deadline: '2026-12-31T00:00:00.000Z',
      })
      .expect(403);
  });

  it('creates a project, returns redacted check-ins and isolates tenants', async () => {
    const projectId = await createProject('tenant-a', 'key-project-0001');

    await request(app.getHttpServer())
      .get(`/planning/tenants/tenant-b/projects/${projectId}/objectives`)
      .set('Authorization', `Bearer ${token('owner', 'admin')}`)
      .expect(404);

    const objective = await request(app.getHttpServer())
      .post(`/planning/tenants/tenant-a/projects/${projectId}/objectives`)
      .set('Authorization', `Bearer ${token('owner', 'admin')}`)
      .send({ idempotencyKey: 'key-objective-0001', title: 'Ship MVP' })
      .expect(201);

    const checkIn = await request(app.getHttpServer())
      .post(
        `/planning/tenants/tenant-a/objectives/${objective.body.id}/check-ins`,
      )
      .set('Authorization', `Bearer ${token('owner', 'admin')}`)
      .send({
        idempotencyKey: 'key-checkin-0001',
        percentage: 25,
        note: 'private check-in note',
      })
      .expect(201);

    expect(checkIn.body.note).toBeUndefined();
    expect(checkIn.body.hasNote).toBe(true);

    const listed = await request(app.getHttpServer())
      .get(
        `/planning/tenants/tenant-a/objectives/${objective.body.id}/check-ins`,
      )
      .set('Authorization', `Bearer ${token('owner', 'admin')}`)
      .expect(200);
    expect(listed.body).toHaveLength(1);
    expect(JSON.stringify(listed.body)).not.toContain('private check-in note');

    await request(app.getHttpServer())
      .post(
        `/planning/tenants/tenant-a/objectives/${objective.body.id}/check-ins`,
      )
      .set('Authorization', `Bearer ${token('owner', 'admin')}`)
      .send({ idempotencyKey: 'key-checkin-invalid', percentage: 101 })
      .expect(400);
  });

  it('replays idempotent mutations and denies project members without permission', async () => {
    const projectId = await createProject('tenant-a', 'key-project-0002');

    const replay = await request(app.getHttpServer())
      .post('/planning/tenants/tenant-a/projects')
      .set('Authorization', `Bearer ${token('owner', 'admin')}`)
      .send({
        idempotencyKey: 'key-project-0002',
        name: 'Apollo',
        deadline: '2026-12-31T00:00:00.000Z',
      })
      .expect(201);
    expect(replay.body.id).toBe(projectId);

    await request(app.getHttpServer())
      .post(`/planning/tenants/tenant-a/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${token('owner', 'admin')}`)
      .send({
        idempotencyKey: 'key-member-0002',
        userId: 'viewer',
        role: PlanningRole.VIEWER,
      })
      .expect(201);

    const objective = await request(app.getHttpServer())
      .post(`/planning/tenants/tenant-a/projects/${projectId}/objectives`)
      .set('Authorization', `Bearer ${token('owner', 'admin')}`)
      .send({ idempotencyKey: 'key-objective-0002', title: 'Goal' })
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/planning/tenants/tenant-a/objectives/${objective.body.id}/check-ins`,
      )
      .set('Authorization', `Bearer ${token('viewer', 'student')}`)
      .send({ idempotencyKey: 'key-viewer-checkin', percentage: 10 })
      .expect(403);
  });
});
