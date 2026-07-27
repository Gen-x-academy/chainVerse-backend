import * as Joi from 'joi';

/**
 * Joi schema that validates required environment variables at startup.
 * Pass this to ConfigModule.forRoot({ validationSchema }) so the app
 * refuses to boot when critical env vars are missing or malformed.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().port().default(3000),

  DATABASE_URL: Joi.string().uri().required(),

  JWT_SECRET: Joi.string().min(32).required(),

  JWT_REFRESH_SECRET: Joi.string().min(32).required(),

  ALLOWED_ORIGINS: Joi.string().default('http://localhost:3000'),

  // Stellar — secret key required in production so reward/certificate signing works
  STELLAR_BACKEND_SECRET: Joi.string().min(1).when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
  }),

  // Contract addresses — required in production so Stellar interactions don't
  // fail at runtime with cryptic errors.  .min(1) ensures empty strings are
  // rejected, not just missing keys.
  CONTRACT_CERTIFICATES: Joi.string().min(1).when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
  }),

  CONTRACT_REWARD: Joi.string().min(1).when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
  }),

  CONTRACT_ESCROW: Joi.string().min(1).when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
  }),

  CONTRACT_CHV_TOKEN: Joi.string().min(1).when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
  }),

  CONTRACT_COURSE_REGISTRY: Joi.string().min(1).when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
  }),

  // ─── Email ──────────────────────────────────────────────────────────────────
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().port().default(587).optional(),
  SMTP_SECURE: Joi.boolean().default(false).optional(),

  // Application base URL used for verification / reset links in emails
  BASE_URL: Joi.string().uri().default('http://localhost:3000'),

  // ─── Audit logging ──────────────────────────────────────────────────────────
  // Dedicated HMAC key for audit-entry integrity hashes. Optional: when unset
  // the service falls back to JWT_SECRET, which keeps existing deployments
  // working. Setting it is strongly recommended in production — sharing the key
  // with JWT_SECRET means rotating that secret silently invalidates the
  // integrity hash of every historical audit entry. AuditService logs a warning
  // at startup when it is missing in production.
  AUDIT_HMAC_SECRET: Joi.string().min(32).optional(),

  // When true, a failed audit write also fails the mutation being audited.
  AUDIT_LOG_FAIL_CLOSED: Joi.boolean().default(false),

  // ─── Uploads: quarantine, scanning and quotas ───────────────────────────────
  // Storage root for uploaded files. Must be outside any web-served directory.
  UPLOAD_STORAGE_ROOT: Joi.string().default('var/uploads'),
  UPLOAD_MAX_FILE_BYTES: Joi.number().integer().positive().default(5242880),
  UPLOAD_QUOTA_MAX_BYTES: Joi.number().integer().positive().default(104857600),
  UPLOAD_QUOTA_MAX_FILES: Joi.number().integer().positive().default(20),
  UPLOAD_QUOTA_WINDOW_MS: Joi.number().integer().positive().default(86400000),
  // Retain infected samples under `infected/` instead of deleting them.
  UPLOAD_RETAIN_INFECTED: Joi.boolean().default(false),

  MALWARE_SCAN_PROVIDER: Joi.string()
    .valid('builtin', 'clamav')
    .default('builtin'),
  MALWARE_SCAN_HOST: Joi.string().default('127.0.0.1'),
  MALWARE_SCAN_PORT: Joi.number().port().default(3310),
  MALWARE_SCAN_TIMEOUT_MS: Joi.number().integer().positive().default(30000),
});

/**
 * Validates a plain env object against the schema and returns the coerced
 * values. Throws a descriptive error on the first violation.
 */
export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const { error, value } = envValidationSchema.validate(env, {
    abortEarly: true,
    allowUnknown: true,
    stripUnknown: false,
  });

  if (error) {
    throw new Error(`Environment validation failed: ${error.message}`);
  }

  return value as Record<string, unknown>;
}
