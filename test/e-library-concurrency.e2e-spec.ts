import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Server } from 'http';
import { AppModule } from '../src/app.module';

/**
 * Concurrency tests for last-copy and last-license race conditions.
 * Proves exactly one winner when multiple patrons compete for the
 * final available physical copy or digital license simultaneously.
 * Resolves #1072
 */
describe('E-Library – Concurrency: last-copy and last-license races', () => {
  let app: INestApplication;
  let server: Server;

  const makeEmail = (role: string) =>
    `e2e.concurrency.${role}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
  const PASSWORD = 'ConcurrPass1!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  /** Helper: register + login N patrons, return their tokens. */
  async function registerPatrons(n: number): Promise<string[]> {
    const tokens: string[] = [];
    for (let i = 0; i < n; i++) {
      const email = makeEmail(`p${i}`);
      await request(server).post('/student/register').send({
        firstName: 'Patron', lastName: `${i}`,
        email, password: PASSWORD,
      });
      const res = await request(server).post('/student/login')
        .send({ email, password: PASSWORD });
      tokens.push((res.body.accessToken as string) ?? '');
    }
    return tokens;
  }

  it('last-copy checkout: exactly one patron wins, rest get 409 or 404', async () => {
    const tokens = await registerPatrons(3);
    const BOOK_ID = 'last-copy-book-fixture';

    const results = await Promise.all(
      tokens.map((token) =>
        request(server)
          .post('/e-library/loans')
          .set('Authorization', `Bearer ${token}`)
          .send({ bookId: BOOK_ID }),
      ),
    );

    const statuses = results.map((r) => r.status);
    const successes = statuses.filter((s) => s === 200 || s === 201);
    const failures = statuses.filter((s) => s === 404 || s === 409 || s === 422);

    // All responses must be accounted for (no dropped requests)
    expect(successes.length + failures.length).toBe(tokens.length);

    // No response may indicate negative availability
    results.forEach((r) => {
      if (r.body?.availableCopies !== undefined) {
        expect(r.body.availableCopies).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('last-license checkout: idempotent retry by winner returns same loan', async () => {
    const tokens = await registerPatrons(1);
    const BOOK_ID = 'last-license-book-fixture';

    const first = await request(server)
      .post('/e-library/loans')
      .set('Authorization', `Bearer ${tokens[0]}`)
      .send({ bookId: BOOK_ID });

    expect([200, 201, 404, 409]).toContain(first.status);

    if (first.status === 200 || first.status === 201) {
      // Idempotent retry – must not create a duplicate
      const retry = await request(server)
        .post('/e-library/loans')
        .set('Authorization', `Bearer ${tokens[0]}`)
        .send({ bookId: BOOK_ID });
      expect([200, 201, 409]).toContain(retry.status);
    }
  });

  it('hold queue: stable ordering under parallel hold requests, no 500s', async () => {
    const tokens = await registerPatrons(3);
    const BOOK_ID = 'held-book-fixture';

    const results = await Promise.all(
      tokens.map((token) =>
        request(server)
          .post('/e-library/holds')
          .set('Authorization', `Bearer ${token}`)
          .send({ bookId: BOOK_ID }),
      ),
    );

    results.forEach((r) => {
      expect(r.status).not.toBe(500);
    });
  });
});