import mongoose from 'mongoose';

/**
 * Minimal deploy-time migration runner for Mongoose collections.
 * Each migration is keyed by a unique name; already-applied migrations are
 * skipped so the script is safe to re-run on every deploy. Closes #403.
 *
 * Usage:  npx ts-node scripts/migrate.ts
 */

interface MigrationDoc {
  name: string;
  appliedAt: Date;
}

const migrations: Array<{
  name: string;
  up: (db: mongoose.Connection) => Promise<void>;
}> = [
  {
    name: '001_add_isActive_to_users',
    async up(db) {
      await db
        .collection('users')
        .updateMany({ isActive: { $exists: false } }, { $set: { isActive: true } });
    },
  },
  {
    name: '002_rename_courseTitle_to_title',
    async up(db) {
      await db
        .collection('courses')
        .updateMany({ courseTitle: { $exists: true } }, { $rename: { courseTitle: 'title' } });
    },
  },
];

async function run() {
  const uri = process.env.MONGO_URI ?? 'mongodb://localhost:27017/chain-verse';
  await mongoose.connect(uri);
  const db = mongoose.connection;
  const col = db.collection<MigrationDoc>('_migrations');

  for (const migration of migrations) {
    const already = await col.findOne({ name: migration.name });
    if (already) {
      console.log(`skip  ${migration.name}`);
      continue;
    }
    await migration.up(db);
    await col.insertOne({ name: migration.name, appliedAt: new Date() });
    console.log(`apply ${migration.name}`);
  }

  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
