import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SessionService } from '../session/session.service';
import { MilestonesAuditService } from './project-milestones-audit.service';
import { ProjectMilestonesController } from './project-milestones.controller';
import { ProjectMilestonesRepository } from './project-milestones.repository';
import { ProjectMilestonesService } from './project-milestones.service';

const secret = 'milestone-integration-secret-at-least-32';

describe('ProjectMilestonesController HTTP integration', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret, signOptions: { algorithm: 'HS256' } }),
      ],
      controllers: [ProjectMilestonesController],
      providers: [
        ProjectMilestonesService,
        ProjectMilestonesRepository,
        MilestonesAuditService,
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

  it('denies unauthenticated and student project mutations', async () => {
    await request(app.getHttpServer())
      .post('/milestones/tenants/tenant-a/projects')
      .send({
        projectId: 'project-http',
        members: { 'owner-1': 'owner' },
      })
      .expect(401);

    await request(app.getHttpServer())
      .post('/milestones/tenants/tenant-a/projects')
      .set('Authorization', `Bearer ${token('student-1', 'student')}`)
      .send({
        projectId: 'project-http',
        members: { 'student-1': 'viewer' },
      })
      .expect(403);
  });

  it('creates, lists, and rejects stale lifecycle transitions', async () => {
    await request(app.getHttpServer())
      .post('/milestones/tenants/tenant-a/projects')
      .set('Authorization', `Bearer ${token('owner-1', 'admin')}`)
      .send({
        projectId: 'project-http',
        members: { 'owner-1': 'owner' },
      })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post(
        '/milestones/tenants/tenant-a/projects/project-http/milestones',
      )
      .set('Authorization', `Bearer ${token('owner-1', 'admin')}`)
      .send({
        idempotencyKey: 'http-create-milestone',
        title: 'HTTP milestone',
        dueDate: '2027-06-30',
        completionCriteria: 'private criteria',
      })
      .expect(201);

    expect(created.body).not.toHaveProperty('completionCriteria');
    expect(created.body.hasCompletionCriteria).toBe(true);

    await request(app.getHttpServer())
      .get(
        '/milestones/tenants/tenant-a/projects/project-http/milestones',
      )
      .set('Authorization', `Bearer ${token('owner-1', 'admin')}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/milestones/tenants/tenant-a/milestones/${created.body.id}/transitions`)
      .set('Authorization', `Bearer ${token('owner-1', 'admin')}`)
      .send({
        idempotencyKey: 'http-active-milestone',
        status: 'active',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/milestones/tenants/tenant-a/milestones/${created.body.id}/transitions`)
      .set('Authorization', `Bearer ${token('owner-1', 'admin')}`)
      .send({
        idempotencyKey: 'http-invalid-milestone',
        status: 'draft',
      })
      .expect(422);
  });
});
