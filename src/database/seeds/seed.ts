/**
 * Database seed runner for local development.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/database/seeds/seed.ts
 *
 * Or via npm script (after adding to package.json):
 *   npm run seed
 *
 * WARNING: This script clears existing seed collections before inserting
 * fresh data. Do NOT run against a production database.
 *
 * To refresh seed data safely:
 *   1. Ensure MONGO_URI points to your local / dev database.
 *   2. Run `npm run seed`.
 *   3. The script is idempotent – running it twice gives the same result.
 */

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { studentSeeds } from './student.seed';
import { courseSeeds } from './course.seed';

dotenv.config();

const MONGO_URI =
  process.env.MONGO_URI ?? 'mongodb://localhost:27017/chain-verse';

// ── Inline schemas (mirrors production schemas without NestJS decorators) ─────

const StudentSchema = new mongoose.Schema(
  {
    firstName: String,
    lastName: String,
    email: { type: String, unique: true },
    passwordHash: String,
    emailVerified: { type: Boolean, default: false },
    verificationToken: { type: String, default: null },
    resetToken: { type: String, default: null },
    resetTokenExpiry: { type: Number, default: null },
    role: { type: String, default: 'student' },
  },
  { timestamps: true },
);

const CourseSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    category: String,
    tags: [String],
    price: Number,
    thumbnailUrl: String,
    tutorId: String,
    tutorEmail: String,
    status: { type: String, default: 'draft' },
    enrolledStudents: [String],
  },
  { timestamps: true },
);

async function run(): Promise<void> {
  console.log(`Connecting to ${MONGO_URI} …`);
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  const StudentModel = mongoose.model('Student', StudentSchema);
  const CourseModel = mongoose.model('Course', CourseSchema);

  // ── Students ──────────────────────────────────────────────────────────────
  console.log('Seeding students …');
  for (const seed of studentSeeds) {
    await StudentModel.updateOne(
      { email: seed.email },
      { $setOnInsert: seed },
      { upsert: true },
    );
  }
  console.log(`  ${studentSeeds.length} student records upserted.`);

  // ── Courses ───────────────────────────────────────────────────────────────
  console.log('Seeding courses …');
  for (const seed of courseSeeds) {
    await CourseModel.updateOne(
      { title: seed.title, tutorEmail: seed.tutorEmail },
      { $setOnInsert: seed },
      { upsert: true },
    );
  }
  console.log(`  ${courseSeeds.length} course records upserted.`);

  await mongoose.disconnect();
  console.log('Done. Seed data is ready.');
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
