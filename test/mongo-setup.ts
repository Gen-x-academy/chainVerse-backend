import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const MONGO_URI_FILE = path.join(os.tmpdir(), 'jest-mongo-uri.txt');

async function verifyMongoConnection(uri: string): Promise<void> {
  const connection = mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  try {
    await connection.asPromise();
  } catch (error) {
    await connection.close().catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`MongoMemoryServer connection check failed: ${message}`);
  }

  await connection.close();
}

export default async function globalSetup() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  try {
    await verifyMongoConnection(uri);
  } catch (error) {
    await mongod.stop();
    throw error;
  }

  fs.writeFileSync(MONGO_URI_FILE, uri);
  (globalThis as Record<string, unknown>).__MONGOD__ = mongod;
}

export { MONGO_URI_FILE };
