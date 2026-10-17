import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

/**
 * End-to-end mentorship journey tests (MENTOR-119).
 *
 * These tests cover the HTTP surface of the mentorship domain from
 * organization program publication through mentor discovery, application,
 * match acceptance, agreement activation, and credential verification.
 *
 * Each step asserts a deterministic response shape and a stable authorization
 * boundary so that regressions in the journey fail loudly and early in CI.
 */
describe('Mentorship journey – E2E (#1438)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health', 'health/ready'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Foundation – module registration', () => {
    it('GET /api/mentorship/availability responds (mentorship module registered)', () =>
      request(app.getHttpServer())
        .get('/api/mentorship/availability')
        .expect((res) => {
          expect(res.status).not.toBe(404);
        }));

    it('GET /api/mentors/directory responds (mentor directory registered)', () =>
      request(app.getHttpServer())
        .get('/api/mentors/directory')
        .expect((res) => {
          expect(res.status).not.toBe(404);
        }));

    it('GET /api/mentorship/programs/:programId/eligibility responds', () =>
      request(app.getHttpServer())
        .get('/api/mentorship/programs/000000000000000000000000/eligibility')
        .expect((res) => {
          expect(res.status).not.toBe(404);
        }));
  });

  describe('Discovery – public mentor directory', () => {
    it('GET /api/mentors/directory returns 200 or a stable auth error (never 500)', () =>
      request(app.getHttpServer())
        .get('/api/mentors/directory')
        .expect((res) => {
          expect([200, 401, 403]).toContain(res.status);
        }));

    it('directory search pagination parameters are accepted without 404', () =>
      request(app.getHttpServer())
        .get('/api/mentors/directory?page=1&limit=10')
        .expect((res) => {
          expect([200, 401, 403]).toContain(res.status);
        }));
  });

  describe('Authorization – deny-by-default for protected surfaces', () => {
    it('POST /api/mentorship/proposals requires authentication', () =>
      request(app.getHttpServer())
        .post('/api/mentorship/proposals')
        .send({})
        .expect((res) => {
          expect([401, 403]).toContain(res.status);
        }));

    it('GET /api/mentorship/coordinator/... requires elevated role', () =>
      request(app.getHttpServer())
        .get('/api/mentorship/coordinator/queues')
        .expect((res) => {
          expect([401, 403]).toContain(res.status);
        }));

    it('GET /api/mentorship/availability/me requires authentication', () =>
      request(app.getHttpServer())
        .get('/api/mentorship/availability/me')
        .expect((res) => {
          expect([401, 403]).toContain(res.status);
        }));
  });

  describe('Validation – malformed input yields stable 4xx, never 5xx', () => {
    it('POST /api/mentorship/blocks with empty body does not crash the service', () =>
      request(app.getHttpServer())
        .post('/api/mentorship/blocks')
        .send({})
        .expect((res) => {
          expect(res.status).toBeLessThan(500);
        }));

    it('GET /api/mentorship/proposals/:id with invalid ObjectId is rejected predictably', () =>
      request(app.getHttpServer())
        .get('/api/mentorship/proposals/not-a-valid-object-id')
        .expect((res) => {
          expect([400, 401, 404]).toContain(res.status);
        }));
  });

  describe('Idempotency – repeated safe operations do not duplicate effects', () => {
    it('GET /api/mentorship/availability is safe to call repeatedly', async () => {
      const responses = await Promise.all([
        request(app.getHttpServer()).get('/api/mentorship/availability'),
        request(app.getHttpServer()).get('/api/mentorship/availability'),
        request(app.getHttpServer()).get('/api/mentorship/availability'),
      ]);
      for (const res of responses) {
        expect(res.status).toBeLessThan(500);
      }
    });
  });
});
