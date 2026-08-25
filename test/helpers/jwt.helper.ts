import * as crypto from 'crypto';

const SECRET = process.env.JWT_SECRET!;

/**
 * Generates a signed JWT using the same HS256 algorithm as StudentAuthService.
 * The SECRET must match what the guards and services use at module-load time,
 * which is guaranteed because setup-env.ts sets process.env.JWT_SECRET first.
 */
export function makeToken(
  payload: Record<string, any>,
  expiresIn = 3600,
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: now, exp: now + expiresIn }),
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

export const makeAdminToken = (
  id = 'seed-admin-id',
  email = 'admin@test.local',
) => makeToken({ sub: id, email, role: 'admin' });

export const makeModeratorToken = (
  id = 'seed-mod-id',
  email = 'mod@test.local',
) => makeToken({ sub: id, email, role: 'moderator' });

export const makeTutorToken = (
  id = 'seed-tutor-id',
  email = 'tutor@test.local',
) => makeToken({ sub: id, email, role: 'tutor' });

export const makeStudentToken = (
  id = 'seed-student-id',
  email = 'student@test.local',
) => makeToken({ sub: id, email, role: 'student' });

export const makeExpiredToken = (
  id = 'seed-admin-id',
  email = 'admin@test.local',
) => makeToken({ sub: id, email, role: 'admin' }, -1);

/** @deprecated Use makeToken / makeAdminToken etc. instead. */
export function generateToken(role: string): string {
  return makeToken({ sub: 'test-user-id', role });
}
