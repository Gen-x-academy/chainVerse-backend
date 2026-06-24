import { MongoMemoryServer } from 'mongodb-memory-server';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export default async function globalTeardown() {
  const mongod = (globalThis as Record<string, unknown>).__MONGOD__ as
    | MongoMemoryServer
    | undefined;
  if (mongod) {
    await mongod.stop();
  }
  const uriFile = path.join(os.tmpdir(), 'jest-mongo-uri.txt');
  if (fs.existsSync(uriFile)) {
    fs.unlinkSync(uriFile);
  }
}
