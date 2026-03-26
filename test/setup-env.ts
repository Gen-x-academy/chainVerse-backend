/**
 * Runs before any module is loaded for each e2e test file.
 * Sets environment variables that module-level constants capture at import time.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

process.env.JWT_SECRET = 'e2e-test-jwt-secret-key-32chars!!';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const uriFile = path.join(os.tmpdir(), 'jest-mongo-uri.txt');
if (fs.existsSync(uriFile)) {
  process.env.MONGO_URI = fs.readFileSync(uriFile, 'utf-8').trim();
}
