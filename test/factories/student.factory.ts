import * as crypto from 'crypto';
import type { Model } from 'mongoose';

import type { StudentDocument } from '../../src/student-auth/schemas/student.schema';

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
    verificationTokenExpiry: null,
    verificationAttempts: 0,
    lastVerificationAttempt: null,
    resetToken: null,
    resetTokenExpiry: null,
    role: 'student',
    ...overrides,
  };
}

export class StudentFactory {
  constructor(private readonly studentModel: Model<StudentDocument>) {}

  build(overrides: Partial<StudentFields> = {}): StudentFields {
    return buildStudent(overrides);
  }

  async create(
    overrides: Partial<StudentFields> = {},
  ): Promise<StudentDocument> {
    const student = new this.studentModel(this.build(overrides));
    return student.save();
  }
}

export async function createStudent(
  studentModel: Model<StudentDocument>,
  overrides: Partial<StudentFields> = {},
): Promise<StudentDocument> {
  return new StudentFactory(studentModel).create(overrides);
}

/** Resets the internal counter. Call in afterEach/afterAll if you need stable emails. */
export function resetStudentCounter(): void {
  counter = 0;
}
