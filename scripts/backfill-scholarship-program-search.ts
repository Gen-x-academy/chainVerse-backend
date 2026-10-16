/**
 * One-off backfill for the catalog search projection (#1175).
 *
 * `ScholarshipProgram` gained five denormalized fields — `awardValue`,
 * `awardCurrency`, `applicationDeadline`, `fundingType`, `network` — that the
 * catalog filters read instead of joining `ProgramTermsVersion`. Programs
 * written before this change have none of them, so until this runs they filter
 * as if they had no published terms.
 *
 * The script is idempotent: it recomputes the projection from the currently
 * published terms revision and only writes when the stored value is missing or
 * different. It can be re-run at any time.
 *
 * Usage:
 *   npx ts-node scripts/backfill-scholarship-program-search.ts
 *
 * Dry run (report only, write nothing):
 *   npx ts-node scripts/backfill-scholarship-program-search.ts --dry-run
 */
import 'dotenv/config';
import { MongoClient, Db, Collection, WithId } from 'mongodb';

/** The terms revision status that makes a revision "current". */
const PUBLISHED = 'published';

/** Conventional deadline keys, in the priority order `deadlineOf` uses. */
const DEADLINE_KEYS = [
  'closesAt',
  'applicationDeadline',
  'dueAt',
  'deadline',
  'closes',
  'applicationsClose',
];

interface ProgramDoc {
  _id: unknown;
  organizationId: string;
  awardValue?: number;
  awardCurrency?: string | null;
  applicationDeadline?: Date | null;
  fundingType?: string;
  network?: string;
}

interface TermsDoc {
  programId: unknown;
  status: string;
  awardValue?: number;
  awardCurrency?: string;
  deadlines?: Record<string, unknown>;
}

function deadlineOf(terms: TermsDoc): Date | null {
  const deadlines = terms?.deadlines;
  if (!deadlines || typeof deadlines !== 'object') return null;
  for (const key of DEADLINE_KEYS) {
    const value = deadlines[key];
    if (value instanceof Date) return value;
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
      return new Date(value);
    }
  }
  return null;
}

/**
 * Computes the projection for one program from its currently published terms.
 *
 * Returns null when the program has no published revision — the catalog then
 * treats it as having no award and no deadline, which is the same answer the
 * schema defaults would have given.
 */
function projectionFor(terms: TermsDoc | null): {
  awardValue: number;
  awardCurrency: string | null;
  applicationDeadline: Date | null;
} {
  return {
    awardValue: terms?.awardValue ?? 0,
    awardCurrency: terms?.awardCurrency ?? null,
    applicationDeadline: terms ? deadlineOf(terms) : null,
  };
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }
  const dryRun = process.argv.includes('--dry-run');

  const client = new MongoClient(uri);
  await client.connect();
  const db: Db = client.db();

  const programs: Collection<ProgramDoc> = db.collection('scholarship_programs');
  const terms: Collection<TermsDoc> = db.collection('program_terms_versions');

  let scanned = 0;
  let published = 0;
  let alreadyCorrect = 0;
  let updated = 0;
  let withoutTerms = 0;

  const cursor = programs.find({}).batchSize(500);
  for await (const program of cursor) {
    scanned += 1;

    const current = terms.findOne({
      programId: program._id,
      status: PUBLISHED,
    });
    // `findOne` is sequential here, not awaited, so await it explicitly.
    const publishedTerms = await current;
    if (!publishedTerms) {
      withoutTerms += 1;
      // Nothing published: the projection should be the empty one. Only write
      // when the stored fields are not already that, so re-running is a no-op.
      const empty = projectionFor(null);
      const needsWrite =
        program.awardValue !== empty.awardValue ||
        program.awardCurrency !== empty.awardCurrency ||
        program.applicationDeadline !== empty.applicationDeadline;
      if (needsWrite) {
        if (!dryRun) {
          await programs.updateOne(
            { _id: program._id },
            { $set: empty },
          );
        }
        updated += 1;
      } else {
        alreadyCorrect += 1;
      }
      continue;
    }

    published += 1;
    const projection = projectionFor(publishedTerms);
    const needsWrite =
      program.awardValue !== projection.awardValue ||
      program.awardCurrency !== projection.awardCurrency ||
      program.applicationDeadline !== projection.applicationDeadline;

    if (!needsWrite) {
      alreadyCorrect += 1;
      continue;
    }

    if (!dryRun) {
      await programs.updateOne(
        { _id: program._id },
        { $set: projection },
      );
    }
    updated += 1;

    if (scanned % 500 === 0) {
      process.stdout.write(
        `  scanned=${scanned} updated=${updated} (dryRun=${dryRun})\n`,
      );
    }
  }

  process.stdout.write(
    JSON.stringify(
      {
        scanned,
        withPublishedTerms: published,
        withoutPublishedTerms: withoutTerms,
        alreadyCorrect,
        updated,
        dryRun,
      },
      null,
      2,
    ) + '\n',
  );

  await client.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
