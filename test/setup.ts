import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Per-suite in-memory MongoDB setup.
 *
 * Jest runs this file as part of `setupFilesAfterEnv`, which means
 * beforeAll/afterAll execute within each test file's worker process,
 * giving every e2e suite its own isolated database instance.
 *
 * When the CI `globalSetup` (mongo-setup.ts) has already started a shared
 * instance and written the URI to a tmp-file, `setup-env.ts` picks it up
 * via `setupFiles` before this file runs. In that case `process.env.MONGO_URI`
 * is already set and we skip starting a second server.
 */

let mongo: MongoMemoryServer | undefined;

beforeAll(async () => {
  if (!process.env.MONGO_URI) {
    mongo = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongo.getUri();
  }
}, 60_000);

afterAll(async () => {
  if (mongo) {
    await mongo.stop();
    mongo = undefined;
  }
});
