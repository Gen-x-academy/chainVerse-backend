import * as crypto from 'crypto';

export interface StudentFields {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  verificationToken: string | null;
  verificationTokenExpiry: number | null;
  verificationAttempts: number;
  lastVerificationAttempt: number | null;
  resetToken: string | null;
  resetTokenExpiry: number | null;
  role: string;
}

let counter = 0;

/**
 * Builds a plain Student document object with sensible defaults.
 *
 * Overrides are merged on top of the defaults, so you only need to specify
 * the fields relevant to each test.
 *
 * @example
 * // Unverified student
 * const student = buildStudent({ emailVerified: false });
 *
 * // Specific email
 * const student = buildStudent({ email: 'specific@example.com' });
 */
export function buildStudent(
  overrides: Partial<StudentFields> = {},
): StudentFields {
  counter += 1;
  return {
    firstName: `Student${counter}`,
    lastName: 'Test',
    email: `student${counter}@factory.test`,
    passwordHash: crypto
      .createHash('sha256')
      .update('TestPassword123!')
      .digest('hex'),
    emailVerified: true,
    verificationToken: null,
    resetToken: null,
    resetTokenExpiry: null,
    role: 'student',
    ...overrides,
  };
}

/** Resets the internal counter. Call in afterEach/afterAll if you need stable emails. */
export function resetStudentCounter(): void {
  counter = 0;
}
