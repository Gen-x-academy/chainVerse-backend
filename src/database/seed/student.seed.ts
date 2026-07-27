import * as crypto from 'crypto';

/**
 * Sample student records for local development seeding.
 * Passwords are stored as SHA-256 hashes here for portability; production
 * services use bcrypt – replace passwordHash values when using in production.
 */

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export const studentSeeds = [
  {
    firstName: 'Alice',
    lastName: 'Johnson',
    email: 'alice@chainverse.dev',
    passwordHash: sha256('Password123!'),
    emailVerified: true,
    verificationToken: null,
    resetToken: null,
    resetTokenExpiry: null,
    role: 'student',
  },
  {
    firstName: 'Bob',
    lastName: 'Smith',
    email: 'bob@chainverse.dev',
    passwordHash: sha256('Password123!'),
    emailVerified: true,
    verificationToken: null,
    resetToken: null,
    resetTokenExpiry: null,
    role: 'student',
  },
  {
    firstName: 'Carol',
    lastName: 'Williams',
    email: 'carol@chainverse.dev',
    passwordHash: sha256('Password123!'),
    emailVerified: false,
    verificationToken: 'sample-verification-token-carol',
    resetToken: null,
    resetTokenExpiry: null,
    role: 'student',
  },
];
