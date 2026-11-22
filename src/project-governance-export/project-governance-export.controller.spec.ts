import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SessionService } from '../session/session.service';
import { GovernanceAuditService } from './project-governance-export-audit.service';
import { ProjectGovernanceExportController } from './project-governance-export.controller';
import { ProjectGovernanceExportRepository } from './project-governance-export.repository';
import { ProjectGovernanceExportService } from './project-governance-export.service';

const secret = 'governance-integration-secret-at-least-32';
const base = '/governance-export/tenants/tenant-a';

describe('ProjectGovernanceExportController HTTP integration', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret, signOptions: { algorithm: 'HS256' } }),
      ],
      controllers: [ProjectGovernanceExportController],
      providers: [
        ProjectGovernanceExportService,
        ProjectGovernanceExportRepository,
        GovernanceAuditService,
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

  const token = (sub: string, role: string) =>
    `Bearer ${jwt.sign({ sub, email: `${sub}@example.com`, role })}`;
  const http = () => request(app.getHttpServer());

  async function seed() {
    await http()
      .post(`${base}/projects`)
      .set('Authorization', token('admin-1', 'admin'))
      .send({
        projectId: 'p1',
        members: { 'owner-1': 'owner', 'viewer-1': 'viewer' },
      })
      .expect(201);
  }

  it('rejects anonymous callers, and students registering projects', async () => {
    await http().post(`${base}/projects`).send({ projectId: 'p1' }).expect(401);
    await http()
      .post(`${base}/projects`)
      .set('Authorization', token('stu-1', 'student'))
      .send({ projectId: 'p1', members: { 'stu-1': 'owner' } })
      .expect(403);
    await http()
      .post(`${base}/projects`)
      .set('Authorization', token('lib-1', 'librarian'))
      .send({ projectId: 'p1' })
      .expect(403);
  });

  it('validates input and rejects unknown fields', async () => {
    await seed();
    await http()
      .post(`${base}/projects/p1/records`)
      .set('Authorization', token('owner-1', 'student'))
      .send({
        idempotencyKey: 'short',
        kind: 'terms_acceptance',
        reference: 'terms-1',
        label: 'x',
      })
      .expect(400);
    await http()
      .post(`${base}/projects/p1/records`)
      .set('Authorization', token('owner-1', 'student'))
      .send({
        idempotencyKey: 'rec-key-0001',
        kind: 'bogus',
        reference: 'terms-1',
        label: 'x',
      })
      .expect(400);
    await http()
      .post(`${base}/projects/p1/records`)
      .set('Authorization', token('owner-1', 'student'))
      .send({
        idempotencyKey: 'rec-key-0001',
        kind: 'terms_acceptance',
        reference: 'terms-1',
        label: 'x',
        recordedBy: 'evil',
      })
      .expect(400);
  });

  it('runs record → export → download → revoke, with stable errors', async () => {
    await seed();
    const owner = token('owner-1', 'student');
    await http()
      .post(`${base}/projects/p1/records`)
      .set('Authorization', owner)
      .send({
        idempotencyKey: 'rec-key-0001',
        kind: 'terms_acceptance',
        reference: 'terms-1',
        label: 'Project terms v1',
      })
      .expect(201);
    await http()
      .post(`${base}/projects/p1/records`)
      .set('Authorization', owner)
      .send({
        idempotencyKey: 'rec-key-0002',
        kind: 'terms_acceptance',
        reference: 'terms-1',
        label: 'again',
      })
      .expect(409);
    await http()
      .post(`${base}/projects/p1/records`)
      .set('Authorization', owner)
      .send({
        idempotencyKey: 'rec-key-0003',
        kind: 'amendment',
        reference: 'am-1',
        targetReference: 'missing',
        label: 'x',
      })
      .expect(422);

    const created = await http()
      .post(`${base}/projects/p1/exports`)
      .set('Authorization', token('viewer-1', 'student'))
      .send({ idempotencyKey: 'exp-key-00001' })
      .expect(201);
    expect(created.body).not.toHaveProperty('content');

    // Another participant cannot fetch it; the requester can.
    await http()
      .get(`${base}/exports/${created.body.id}`)
      .set('Authorization', owner)
      .expect(404);
    const download = await http()
      .get(`${base}/exports/${created.body.id}`)
      .set('Authorization', token('viewer-1', 'student'))
      .expect(200);
    expect(download.body.content.acceptedTerms[0].label).toBe(
      'Project terms v1',
    );
    expect(JSON.stringify(download.body)).not.toContain('owner-1');

    await http()
      .post(`${base}/exports/${created.body.id}/revocations`)
      .set('Authorization', token('viewer-1', 'student'))
      .send({ idempotencyKey: 'rev-key-00001' })
      .expect(201);
    await http()
      .post(`${base}/exports/${created.body.id}/revocations`)
      .set('Authorization', token('viewer-1', 'student'))
      .send({ idempotencyKey: 'rev-key-00002' })
      .expect(422);
  });

  it('keeps audit admin-only and denies outsiders an export', async () => {
    await seed();
    await http()
      .post(`${base}/projects/p1/exports`)
      .set('Authorization', token('stranger-1', 'student'))
      .send({ idempotencyKey: 'exp-key-00001' })
      .expect(403);
    await http()
      .get(`${base}/audit`)
      .set('Authorization', token('owner-1', 'student'))
      .expect(403);
    await http()
      .get(`${base}/audit`)
      .set('Authorization', token('admin-1', 'admin'))
      .expect(200);
  });
});
