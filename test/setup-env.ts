/**
 * Runs before any module is loaded for each e2e test file.
 * Sets environment variables that module-level constants capture at import time.
 */
process.env.JWT_SECRET = 'e2e-test-jwt-secret-key-32chars!!';
process.env.NODE_ENV = 'test';
