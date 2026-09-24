import * as Joi from 'joi';

/**
 * Joi schema that validates environment variables at application startup.
 *
 * Required:
 *   JWT_SECRET – must be at least 32 characters to prevent weak secrets.
 *
 * Optional (sensible defaults are provided so the app boots in development
 * without a full .env file):
 *   PORT, NODE_ENV, MONGO_URI, and feature-level variables for email,
 *   Google OAuth, Redis, and rate-limiting.
 */
export const envValidationSchema = Joi.object({
  // ── Core ──────────────────────────────────────────────────────────────────
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().integer().min(1).max(65535).default(3000),

  // ── Logging ───────────────────────────────────────────────────────────────
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),

  // ── Database ──────────────────────────────────────────────────────────────
  MONGO_URI: Joi.string()
    .default('mongodb://localhost:27017/chain-verse'),

  MONGODB_TEST_URI: Joi.string().allow('').optional(),

  // ── Authentication ────────────────────────────────────────────────────────
  JWT_SECRET: Joi.string().min(32).required(),

  DOWNLOAD_TOKEN_EXPIRY: Joi.number().integer().positive().default(3600),
  BULK_DOWNLOAD_TOKEN_EXPIRY: Joi.number().integer().positive().default(7200),

  // ── Email ─────────────────────────────────────────────────────────────────
  EMAIL_USER: Joi.string().allow('').optional(),
  EMAIL_PASS: Joi.string().allow('').optional(),

  // ── Application base URL ──────────────────────────────────────────────────
  BASE_URL: Joi.string().allow('').default('http://localhost:3000'),

  // ── Google OAuth ──────────────────────────────────────────────────────────
  GOOGLE_CLIENT_ID: Joi.string().allow('').optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').optional(),
  CALLBACK_URL: Joi.string().allow('').default('http://localhost:3000/auth/google/callback'),

  // ── Redis (optional – app degrades gracefully without it) ─────────────────
  REDIS_URL: Joi.string().allow('').optional(),
  FORCE_REDIS: Joi.boolean().default(false),

  // ── Rate limiting ─────────────────────────────────────────────────────────
  RATE_LIMIT_ENABLED: Joi.boolean().default(true),
  RATE_LIMIT_GUEST_WINDOW_MS: Joi.number().integer().positive().default(60000),
  RATE_LIMIT_GUEST_MAX: Joi.number().integer().positive().default(30),
  RATE_LIMIT_AUTH_WINDOW_MS: Joi.number().integer().positive().default(60000),
  RATE_LIMIT_AUTH_MAX: Joi.number().integer().positive().default(100),
  RATE_LIMIT_PREMIUM_WINDOW_MS: Joi.number().integer().positive().default(60000),
  RATE_LIMIT_PREMIUM_MAX: Joi.number().integer().positive().default(200),
  RATE_LIMIT_ADMIN_WINDOW_MS: Joi.number().integer().positive().default(60000),
  RATE_LIMIT_ADMIN_MAX: Joi.number().integer().positive().default(500),
  RATE_LIMIT_SKIP_SUCCESS: Joi.boolean().default(false),
  RATE_LIMIT_SKIP_FAILED: Joi.boolean().default(false),
  RATE_LIMIT_KEY_PREFIX: Joi.string().default('rl:'),

  // ── Scholarship finance ───────────────────────────────────────────────────
  STELLAR_HORIZON_URL_TESTNET: Joi.string()
    .uri()
    .default('https://horizon-testnet.stellar.org'),
  STELLAR_HORIZON_URL_PUBLIC: Joi.string()
    .uri()
    .default('https://horizon.stellar.org'),
  STELLAR_HORIZON_TIMEOUT_MS: Joi.number().integer().positive().default(10000),
  SCHOLARSHIP_RECONCILIATION_INTERVAL_MS: Joi.number().integer().min(0).default(3600000),
  SCHOLARSHIP_RECONCILIATION_MAX_AGE_MS: Joi.number().integer().positive().default(3600000),
  SCHOLARSHIP_PAYOUT_RETRY_INTERVAL_MS: Joi.number().integer().min(0).default(60000),
  SCHOLARSHIP_PAYOUT_MAX_ATTEMPTS: Joi.number().integer().min(1).max(20).default(5),
  SCHOLARSHIP_PAYOUT_ENVELOPE_TTL_SECONDS: Joi.number().integer().min(30).default(300),
}).options({ allowUnknown: true });
