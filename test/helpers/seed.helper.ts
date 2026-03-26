import request from 'supertest';
import { Server } from 'http';

export const SEED_STUDENT = {
  firstName: 'Alice',
  lastName: 'Test',
  email: 'alice.test@example.com',
  password: 'SecurePass123!',
};

export interface SeededStudent {
  accessToken: string;
  refreshToken: string;
  verificationToken: string;
  userId: string;
}

/**
 * Creates and email-verifies a student through the real HTTP API.
 * Returns the tokens the service issued so subsequent tests can use them.
 */
export async function seedVerifiedStudent(
  server: Server,
  overrides: Partial<typeof SEED_STUDENT> = {},
): Promise<SeededStudent> {
  const payload = { ...SEED_STUDENT, ...overrides };

  const createRes = await request(server).post('/student/create').send(payload);

  if (createRes.status !== 201 && createRes.status !== 200) {
    throw new Error(`seedVerifiedStudent: create failed ${createRes.status} – ${JSON.stringify(createRes.body)}`);
  }

  const { verificationToken, accessToken, refreshToken, user } = createRes.body;

  const verifyRes = await request(server)
    .post('/student/verify-email')
    .send({ token: verificationToken });

  if (verifyRes.status !== 201 && verifyRes.status !== 200) {
    throw new Error(`seedVerifiedStudent: verify failed ${verifyRes.status} – ${JSON.stringify(verifyRes.body)}`);
  }

  return { accessToken, refreshToken, verificationToken, userId: user.id };
}
