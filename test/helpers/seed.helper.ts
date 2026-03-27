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
    throw new Error(
      `seedVerifiedStudent: create failed ${createRes.status} – ${JSON.stringify(createRes.body)}`,
    );
  }

  const { accessToken, refreshToken, user } = createRes.body;

  // Request a verification token via the resend endpoint
  const resendRes = await request(server)
    .post('/student/resend-verification-email')
    .send({ email: user.email });

  if (resendRes.status !== 201 && resendRes.status !== 200) {
    throw new Error(
      `seedVerifiedStudent: resend verification failed ${resendRes.status} – ${JSON.stringify(resendRes.body)}`,
    );
  }

  // In test mode, the verification token is leaked in the notification event
  // For this helper, we'll use a workaround by directly getting the token from the student record
  // In a real scenario, the token would be sent via email
  const verificationToken = await getVerificationTokenFromDB(user.id);

  const verifyRes = await request(server)
    .post('/student/verify-email')
    .send({ token: verificationToken });

  if (verifyRes.status !== 201 && verifyRes.status !== 200) {
    throw new Error(
      `seedVerifiedStudent: verify failed ${verifyRes.status} – ${JSON.stringify(verifyRes.body)}`,
    );
  }

  return { accessToken, refreshToken, userId: user.id };
}

/**
 * Helper to get the verification token from the database for testing purposes.
 * In production, this would come from an email.
 */
async function getVerificationTokenFromDB(userId: string): Promise<string> {
  // This is a test helper that accesses the database directly
  // We use the NestJS app to get the model
  const { MongoClient } = await import('mongodb');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const mongoDb = process.env.MONGODB_DB || 'chainverse-test';

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(mongoDb);
    const student = await db.collection('students').findOne({ _id: userId });
    if (!student || !student.verificationToken) {
      throw new Error('Verification token not found');
    }
    return student.verificationToken;
  } finally {
    await client.close();
  }
}
