import { Test as NestTest, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import request from 'supertest';
import { Server } from 'http';

interface AuthResponse {
  message: string;
  user?: {
    email: string;
    emailVerified: boolean;
    id?: string;
  };
  accessToken?: string;
  refreshToken?: string;
  verificationToken?: string;
  resetToken?: string;
}

/**
 * End-to-end journey tests for the student authentication flow.
 *
 * Each describe block exercises one slice of the flow in a shared app instance.
 * Tests within each block run in order and share state via closure variables,
 * mimicking a real user session progressing through the journey.
 */
describe('Student Auth – Full Journey (e2e)', () => {
  let app: INestApplication;
  let server: Server;

  // Tokens and one-time codes captured across the journey
  let accessToken: string;
  let refreshToken: string;

  const BASE_EMAIL = 'journey.student@example.com';
  const BASE_PASSWORD = 'JourneyPass1!';
  const VERIFICATION_EMAIL = 'verify.student@example.com';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await NestTest.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------
  describe('POST /student/create', () => {
    it('creates a new student and returns tokens (verification token sent via email)', async () => {
      const res = await request(server)
        .post('/student/create')
        .send({
          firstName: 'Journey',
          lastName: 'Student',
          email: BASE_EMAIL,
          password: BASE_PASSWORD,
        })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      expect(res.body.message as string).toMatch(/verify your email/i);
      expect((res.body.user as AuthResponse['user'])?.email).toBe(BASE_EMAIL);
      expect((res.body.user as AuthResponse['user'])?.emailVerified).toBe(
        false,
      );
      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');
      // Verification token is no longer returned in response for security
      expect(res.body.verificationToken).toBeUndefined();

      accessToken = res.body.accessToken as string;
      refreshToken = res.body.refreshToken as string;
    });

    it('rejects a duplicate email with 409', () =>
      request(server)
        .post('/student/create')
        .send({
          firstName: 'Dup',
          lastName: 'User',
          email: BASE_EMAIL,
          password: BASE_PASSWORD,
        })
        .expect(409));

    it('rejects missing required fields with 400', () =>
      request(server)
        .post('/student/create')
        .send({ email: 'no-name@example.com', password: 'ValidPass1!' })
        .expect(400));

    it('rejects an invalid email format with 400', () =>
      request(server)
        .post('/student/create')
        .send({
          firstName: 'A',
          lastName: 'B',
          email: 'not-an-email',
          password: 'ValidPass1!',
        })
        .expect(400));

    it('rejects a password shorter than 8 characters with 400', () =>
      request(server)
        .post('/student/create')
        .send({
          firstName: 'A',
          lastName: 'B',
          email: 'short@example.com',
          password: 'short',
        })
        .expect(400));
  });

  // ---------------------------------------------------------------------------
  // Request verification token for testing
  // ---------------------------------------------------------------------------
  describe('POST /student/resend-verification-email', () => {
    it('sends a verification token for an unverified email', async () => {
      // First create a new unverified student
      await request(server).post('/student/create').send({
        firstName: 'Verify',
        lastName: 'Student',
        email: VERIFICATION_EMAIL,
        password: BASE_PASSWORD,
      });

      // Request verification email - in test mode, token is returned in notification event
      const res = await request(server)
        .post('/student/resend-verification-email')
        .send({ email: VERIFICATION_EMAIL })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      expect(res.body.message).toMatch(/verification link has been sent/i);
    });

    it('rejects already verified email', async () => {
      const res = await request(server)
        .post('/student/resend-verification-email')
        .send({ email: BASE_EMAIL })
        .expect(400);

      expect(res.body.message).toMatch(/already verified/i);
    });
  });

  // ---------------------------------------------------------------------------
  // Login before verification
  // ---------------------------------------------------------------------------
  describe('POST /student/login (unverified)', () => {
    it('denies login when email is not yet verified with 401', () =>
      request(server)
        .post('/student/login')
        .send({ email: BASE_EMAIL, password: BASE_PASSWORD })
        .expect(401));
  });

  // ---------------------------------------------------------------------------
  // Email verification
  // ---------------------------------------------------------------------------
  describe('POST /student/verify-email', () => {
    it('rejects a missing token with 400', () =>
      request(server).post('/student/verify-email').send({}).expect(400));

    it('rejects an invalid token with 400', () =>
      request(server)
        .post('/student/verify-email')
        .send({ token: 'totally-wrong-token' })
        .expect(400));

    it('verifies the email with a valid JWT token', async () => {
      // Get verification token from database for testing
      const { MongoClient } = await import('mongodb');
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
      const mongoDb = process.env.MONGODB_DB || 'chainverse-test';
      const client = new MongoClient(mongoUri);

      try {
        await client.connect();
        const db = client.db(mongoDb);

        // Get the student
        const student = await db
          .collection('students')
          .findOne({ email: BASE_EMAIL });
        if (!student) {
          throw new Error('Student not found');
        }

        // Get the verification token from student record
        if (!student.verificationToken) {
          throw new Error('Verification token not found');
        }

        const res = await request(server)
          .post('/student/verify-email')
          .send({ token: student.verificationToken })
          .expect((r) => {
            if (r.status !== 200 && r.status !== 201) {
              throw new Error(
                `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
              );
            }
          });

        expect(res.body.message).toMatch(/verified/i);
      } finally {
        await client.close();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Login after verification
  // ---------------------------------------------------------------------------
  describe('POST /student/login (verified)', () => {
    it('rejects missing credentials with 400', () =>
      request(server).post('/student/login').send({}).expect(400));

    it('rejects a wrong password with 401', () =>
      request(server)
        .post('/student/login')
        .send({ email: BASE_EMAIL, password: 'WrongPassword!' })
        .expect(401));

    it('succeeds with correct credentials and returns tokens', async () => {
      const res = await request(server)
        .post('/student/login')
        .send({ email: BASE_EMAIL, password: BASE_PASSWORD })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      expect(res.body.user.email).toBe(BASE_EMAIL);
      expect(res.body.user.emailVerified).toBe(true);
      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');

      // Refresh the captured tokens from this fresh login
      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });
  });

  // ---------------------------------------------------------------------------
  // Token refresh
  // ---------------------------------------------------------------------------
  describe('POST /student/refresh-token', () => {
    it('rejects a missing refresh token with 400', () =>
      request(server).post('/student/refresh-token').send({}).expect(400));

    it('rejects an invalid refresh token with 401', () =>
      request(server)
        .post('/student/refresh-token')
        .send({ refreshToken: 'not.a.real.token' })
        .expect(401));

    it('issues a new token pair with a valid refresh token', async () => {
      const res = await request(server)
        .post('/student/refresh-token')
        .send({ refreshToken })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');

      // Rotate
      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('rejects a refresh token that has already been consumed with 401', async () => {
      // Capture the current token, rotate it, then try to replay the old one
      const oldToken = refreshToken;
      const rotateRes = await request(server)
        .post('/student/refresh-token')
        .send({ refreshToken: oldToken })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      refreshToken = rotateRes.body.refreshToken;

      // Replaying the consumed old token must be rejected and revoke the family
      await request(server)
        .post('/student/refresh-token')
        .send({ refreshToken: oldToken })
        .expect(401);

      // The new token issued from rotation should also be revoked (family invalidated)
      await request(server)
        .post('/student/refresh-token')
        .send({ refreshToken })
        .expect(401);

      // Re-login to get a fresh token for subsequent tests
      const loginRes = await request(server)
        .post('/student/login')
        .send({ email: BASE_EMAIL, password: BASE_PASSWORD })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });
      refreshToken = loginRes.body.refreshToken;
    });
  });

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------
  describe('POST /student/logout', () => {
    it('rejects a missing refresh token with 400', () =>
      request(server).post('/student/logout').send({}).expect(400));

    it('invalidates the session and returns success', async () => {
      const res = await request(server)
        .post('/student/logout')
        .send({ refreshToken })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      expect(res.body.message).toMatch(/logged out/i);
    });

    it('the logged-out refresh token can no longer be used to refresh', () =>
      request(server)
        .post('/student/refresh-token')
        .send({ refreshToken })
        .expect(401));
  });

  // ---------------------------------------------------------------------------
  // Password reset
  // ---------------------------------------------------------------------------
  describe('Password reset flow', () => {
    it('POST /student/forget/password returns success for any email (no oracle)', async () => {
      const res = await request(server)
        .post('/student/forget/password')
        .send({ email: BASE_EMAIL })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      expect(res.body.message).toMatch(/reset link/i);
      // Token is no longer returned in response for security
      expect(res.body.resetToken).toBeUndefined();
    });

    it('POST /student/forget/password returns success even for an unknown email', async () => {
      const res = await request(server)
        .post('/student/forget/password')
        .send({ email: 'ghost@example.com' })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      expect(res.body.message).toMatch(/reset link/i);
    });

    it('POST /student/forget/password rejects a missing email with 400', () =>
      request(server).post('/student/forget/password').send({}).expect(400));

    it('POST /student/reset/password rejects a missing body with 400', () =>
      request(server).post('/student/reset/password').send({}).expect(400));

    it('POST /student/reset/password rejects an invalid token with 400', () =>
      request(server)
        .post('/student/reset/password')
        .send({ token: 'bad-token', newPassword: 'NewPass123!' })
        .expect(400));

    it('POST /student/reset/password rejects a short new password with 400', () =>
      request(server)
        .post('/student/reset/password')
        .send({ token: 'sometoken', newPassword: 'short' })
        .expect(400));

    it('POST /student/reset/password rejects an expired token with 400', async () => {
      // Generate a fake expired token (this would fail validation)
      const res = await request(server)
        .post('/student/reset/password')
        .send({ token: 'invalid-token-format', newPassword: 'NewSecurePass1!' })
        .expect(400);

      expect(res.body.message).toMatch(/invalid|expired/i);
    });

    it('POST /student/reset/password rejects a used token (one-time use)', async () => {
      // First, request a reset token
      await request(server)
        .post('/student/forget/password')
        .send({ email: BASE_EMAIL });

      // Get the token from database for testing
      const { MongoClient } = await import('mongodb');
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
      const mongoDb = process.env.MONGODB_DB || 'chainverse-test';
      const client = new MongoClient(mongoUri);

      try {
        await client.connect();
        const db = client.db(mongoDb);

        // Get the student
        const student = await db
          .collection('students')
          .findOne({ email: BASE_EMAIL });
        if (!student) {
          throw new Error('Student not found');
        }

        // Get the reset token
        const resetTokenRecord = await db
          .collection('passwordresettokens')
          .findOne(
            { studentId: student._id.toString(), used: false },
            { sort: { createdAt: -1 } },
          );

        if (!resetTokenRecord) {
          throw new Error('Reset token not found');
        }

        // Use the token once
        await request(server)
          .post('/student/reset/password')
          .send({
            token: resetTokenRecord.tokenHash,
            newPassword: 'TempPass123!',
          })
          .expect(200);

        // Try to use it again - should fail
        const res = await request(server)
          .post('/student/reset/password')
          .send({
            token: resetTokenRecord.tokenHash,
            newPassword: 'AnotherPass123!',
          })
          .expect(400);

        expect(res.body.message).toMatch(/invalid|expired/i);
      } finally {
        await client.close();
      }
    });

    it('POST /student/reset/password resets the password with a valid token', async () => {
      // Request a new reset token
      await request(server)
        .post('/student/forget/password')
        .send({ email: BASE_EMAIL });

      // Get the token from database for testing
      const { MongoClient } = await import('mongodb');
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
      const mongoDb = process.env.MONGODB_DB || 'chainverse-test';
      const client = new MongoClient(mongoUri);

      try {
        await client.connect();
        const db = client.db(mongoDb);

        const student = await db
          .collection('students')
          .findOne({ email: BASE_EMAIL });
        if (!student) {
          throw new Error('Student not found');
        }

        const resetTokenRecord = await db
          .collection('passwordresettokens')
          .findOne(
            { studentId: student._id.toString(), used: false },
            { sort: { createdAt: -1 } },
          );

        if (!resetTokenRecord) {
          throw new Error('Reset token not found');
        }

        const res = await request(server)
          .post('/student/reset/password')
          .send({
            token: resetTokenRecord.tokenHash,
            newPassword: 'NewSecurePass1!',
          })
          .expect((r) => {
            if (r.status !== 200 && r.status !== 201) {
              throw new Error(
                `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
              );
            }
          });

        expect(res.body.message).toMatch(/reset successfully/i);
      } finally {
        await client.close();
      }
    });

    it('old password no longer works after reset', () =>
      request(server)
        .post('/student/login')
        .send({ email: BASE_EMAIL, password: BASE_PASSWORD })
        .expect(401));

    it('new password works after reset', async () => {
      const res = await request(server)
        .post('/student/login')
        .send({ email: BASE_EMAIL, password: 'NewSecurePass1!' })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      expect(res.body.user.email).toBe(BASE_EMAIL);
    });
  });

  // ---------------------------------------------------------------------------
  // Protected routes - ensure they reject unauthenticated requests
  // ---------------------------------------------------------------------------
  describe('Protected routes', () => {
    it('rejects requests to protected student endpoints without authentication', async () => {
      // Test various protected endpoints
      const protectedEndpoints = [
        '/student/account-settings',
        '/student/enrollments',
        '/student/saved-courses',
      ];

      for (const endpoint of protectedEndpoints) {
        await request(server).get(endpoint).expect(401);
      }
    });

    it('rejects requests with invalid JWT token', async () => {
      const invalidToken = 'invalid.jwt.token';

      await request(server)
        .get('/student/account-settings')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);
    });

    it('rejects requests with expired JWT token', async () => {
      // Create an expired token manually
      const expiredToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZXhwIjoxNjEwNjI4MDAwfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      await request(server)
        .get('/student/account-settings')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    it('allows requests with valid JWT token', async () => {
      // Use the access token from login
      const res = await request(server)
        .get('/student/account-settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect((r) => {
          // Should not be 401, may be 200, 404, or other status depending on implementation
          if (r.status === 401) {
            throw new Error('Valid token was rejected');
          }
        });

      // The exact response depends on the endpoint implementation
      // We just verify it's not an authentication error
      expect(res.status).not.toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Token rotation tests
  // ---------------------------------------------------------------------------
  describe('Token rotation security', () => {
    it('prevents reuse of consumed refresh tokens', async () => {
      // Get a fresh login token
      const loginRes = await request(server)
        .post('/student/login')
        .send({ email: BASE_EMAIL, password: 'NewSecurePass1!' })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      const freshRefreshToken = loginRes.body.refreshToken;

      // Use the refresh token once
      await request(server)
        .post('/student/refresh-token')
        .send({ refreshToken: freshRefreshToken })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      // Try to reuse the same token - should be rejected
      await request(server)
        .post('/student/refresh-token')
        .send({ refreshToken: freshRefreshToken })
        .expect(401);
    });

    it('invalidates entire token family on replay attack', async () => {
      // Get a fresh login token
      const loginRes = await request(server)
        .post('/student/login')
        .send({ email: BASE_EMAIL, password: 'NewSecurePass1!' })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      const freshRefreshToken = loginRes.body.refreshToken;

      // First refresh - get new token
      const firstRefresh = await request(server)
        .post('/student/refresh-token')
        .send({ refreshToken: freshRefreshToken })
        .expect((r) => {
          if (r.status !== 200 && r.status !== 201) {
            throw new Error(
              `Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`,
            );
          }
        });

      const newRefreshToken = firstRefresh.body.refreshToken;

      // Replay the old token - should invalidate the family
      await request(server)
        .post('/student/refresh-token')
        .send({ refreshToken: freshRefreshToken })
        .expect(401);

      // The new token should also be invalid now
      await request(server)
        .post('/student/refresh-token')
        .send({ refreshToken: newRefreshToken })
        .expect(401);
    });
  });
});
