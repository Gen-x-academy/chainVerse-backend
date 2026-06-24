import request from 'supertest';
import { Server } from 'http';

export const SEED_STUDENT = {
  firstName: 'Alice',
  lastName: 'Test',
  email: 'alice.test@example.com',
  password: 'SecurePass123!',
};

interface SeededStudent {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

interface CreateResponse {
  status: number;
  body: {
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      email: string;
    };
  };
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

  const { accessToken, refreshToken, user } =
    createRes.body as CreateResponse['body'];

  const resendRes = await request(server)
    .post('/student/resend-verification-email')
    .send({ email: (user as any)?.email });

  if (resendRes.status !== 201 && resendRes.status !== 200) {
    throw new Error(
      `seedVerifiedStudent: resend verification failed ${resendRes.status} – ${JSON.stringify(resendRes.body)}`,
    );
  }

  const verificationToken = await getVerificationTokenFromDB((user as any)?.id);

  const verifyRes = await request(server)
    .post('/student/verify-email')
    .send({ token: verificationToken });

  if (verifyRes.status !== 201 && verifyRes.status !== 200) {
    throw new Error(
      `seedVerifiedStudent: verify failed ${verifyRes.status} – ${JSON.stringify(verifyRes.body)}`,
    );
  }

  return { accessToken, refreshToken, userId: (user as any).id };
}

/**
 * Helper to get the verification token from the database for testing purposes.
 * In production, this would come from an email.
 */
async function getVerificationTokenFromDB(userId: string): Promise<string> {
  const { MongoClient } = await import('mongodb');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const mongoDb = process.env.MONGODB_DB || 'chainverse-test';

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(mongoDb);
    const student = (await db
      .collection('students')
      .findOne({ _id: userId })) as any;
    if (!student || !student.verificationToken) {
      throw new Error('Verification token not found');
    }
    return student.verificationToken as string;
  } finally {
    await client.close();
  }
}
