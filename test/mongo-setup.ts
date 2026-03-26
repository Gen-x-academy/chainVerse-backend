import { MongoMemoryServer } from 'mongodb-memory-server';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const MONGO_URI_FILE = path.join(os.tmpdir(), 'jest-mongo-uri.txt');

export default async function globalSetup() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  fs.writeFileSync(MONGO_URI_FILE, uri);
  (globalThis as Record<string, unknown>).__MONGOD__ = mongod;
}

export { MONGO_URI_FILE };
