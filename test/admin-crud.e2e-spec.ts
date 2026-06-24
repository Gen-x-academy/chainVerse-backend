import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  makeAdminToken,
  makeModeratorToken,
  makeTutorToken,
  makeStudentToken,
} from './helpers/jwt.helper';

/**
 * End-to-end tests for the Admin Auth CRUD resource.
 *
 * Covers:
 *  – Public read endpoints
 *  – Authentication enforcement (missing / invalid / expired tokens)
 *  – Role-based access control (student blocked, tutor allowed to write but not delete)
 *  – Full create → read → update → delete lifecycle
 */
describe('Admin Auth CRUD + Permissions (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  let adminToken: string;
  let moderatorToken: string;
  let tutorToken: string;
  let studentToken: string;

  // ID of the item created during the suite
  let createdId: string;

  const SAMPLE_PAYLOAD = {
    title: 'E2E Test Entry',
    description: 'Created by the e2e suite',
    metadata: { env: 'test' },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer() as unknown as App;

    // Pre-mint role tokens – these are valid JWTs signed with the test secret
    adminToken = makeAdminToken();
    moderatorToken = makeModeratorToken();
    tutorToken = makeTutorToken();
    studentToken = makeStudentToken();
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Public read endpoints
  // ---------------------------------------------------------------------------
  describe('GET /admin/auth', () => {
    it('is publicly accessible and returns an array', async () => {
      const res = await request(server).get('/admin/auth').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Authentication enforcement on POST
  // ---------------------------------------------------------------------------
  describe('POST /admin/auth – authentication', () => {
    it('rejects a request with no Authorization header with 401', () =>
      request(server).post('/admin/auth').send(SAMPLE_PAYLOAD).expect(401));

    it('rejects a malformed Bearer token with 401', () =>
      request(server)
        .post('/admin/auth')
        .set('Authorization', 'Bearer not.a.real.jwt')
        .send(SAMPLE_PAYLOAD)
        .expect(401));

    it('rejects a token with a tampered signature with 401', () => {
      const forged = adminToken.slice(0, -5) + 'XXXXX';
      return request(server)
        .post('/admin/auth')
        .set('Authorization', `Bearer ${forged}`)
        .send(SAMPLE_PAYLOAD)
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Role-based access control on POST
  // ---------------------------------------------------------------------------
  describe('POST /admin/auth – role enforcement', () => {
    it('rejects a student token with 403', () =>
      request(server)
        .post('/admin/auth')
        .set('Authorization', `Bearer ${studentToken}`)
        .send(SAMPLE_PAYLOAD)
        .expect(403));

    it('accepts a tutor token and creates the item (201 or 200)', async () => {
      const res = await request(server)
        .post('/admin/auth')
        .set('Authorization', `Bearer ${tutorToken}`)
        .send({ title: 'Tutor-created entry' })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('Tutor-created entry');
    });

    it('accepts a moderator token and creates the item', async () => {
      const res = await request(server)
        .post('/admin/auth')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ title: 'Moderator-created entry' })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      expect(res.body.id).toBeDefined();
    });

    it('accepts an admin token and creates the canonical test item', async () => {
      const res = await request(server)
        .post('/admin/auth')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(SAMPLE_PAYLOAD)
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe(SAMPLE_PAYLOAD.title);
      expect(res.body.description).toBe(SAMPLE_PAYLOAD.description);

      createdId = res.body.id;
    });
  });

  // ---------------------------------------------------------------------------
  // Read by ID
  // ---------------------------------------------------------------------------
  describe('GET /admin/auth/:id', () => {
    it('returns the created item by id', async () => {
      const res = await request(server)
        .get(`/admin/auth/${createdId}`)
        .expect(200);

      expect(res.body.id).toBe(createdId);
      expect(res.body.title).toBe(SAMPLE_PAYLOAD.title);
    });

    it('returns 404 for a non-existent id', () =>
      request(server).get('/admin/auth/non-existent-id-xyz').expect(404));
  });

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------
  describe('PATCH /admin/auth/:id – authentication + role enforcement', () => {
    it('rejects unauthenticated requests with 401', () =>
      request(server)
        .patch(`/admin/auth/${createdId}`)
        .send({ title: 'Hacked' })
        .expect(401));

    it('rejects a student token with 403', () =>
      request(server)
        .patch(`/admin/auth/${createdId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'Hacked' })
        .expect(403));

    it('updates the item with an admin token', async () => {
      const res = await request(server)
        .patch(`/admin/auth/${createdId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Updated Title', description: 'Updated by e2e' })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      expect(res.body.title).toBe('Updated Title');
      expect(res.body.description).toBe('Updated by e2e');
    });

    it('reflects the update on a subsequent GET', async () => {
      const res = await request(server)
        .get(`/admin/auth/${createdId}`)
        .expect(200);
      expect(res.body.title).toBe('Updated Title');
    });
  });

  // ---------------------------------------------------------------------------
  // Delete – role-based restriction (tutor cannot delete)
  // ---------------------------------------------------------------------------
  describe('DELETE /admin/auth/:id – role enforcement', () => {
    it('rejects unauthenticated requests with 401', () =>
      request(server).delete(`/admin/auth/${createdId}`).expect(401));

    it('rejects a tutor token with 403 (tutors cannot delete)', () =>
      request(server)
        .delete(`/admin/auth/${createdId}`)
        .set('Authorization', `Bearer ${tutorToken}`)
        .expect(403));

    it('rejects a student token with 403', () =>
      request(server)
        .delete(`/admin/auth/${createdId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403));

    it('deletes the item with an admin token', async () => {
      const res = await request(server)
        .delete(`/admin/auth/${createdId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      expect(res.body.deleted).toBe(true);
      expect(res.body.id).toBe(createdId);
    });

    it('returns 404 on a subsequent GET after deletion', () =>
      request(server).get(`/admin/auth/${createdId}`).expect(404));

    it('returns 404 when trying to delete the already-deleted item', () =>
      request(server)
        .delete(`/admin/auth/${createdId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404));
  });

  // ---------------------------------------------------------------------------
  // List reflects all mutations
  // ---------------------------------------------------------------------------
  describe('GET /admin/auth – post-mutation list', () => {
    it('does not contain the deleted item', async () => {
      const res = await request(server).get('/admin/auth').expect(200);
      const ids = (res.body as Array<{ id: string }>).map((i) => i.id);
      expect(ids).not.toContain(createdId);
    });
  });
});
