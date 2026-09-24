export interface AppConfig {
  nodeEnv: string;
  port: number;
  logLevel: string;
  mongoUri: string;
  jwtSecret: string;
  downloadTokenExpiry: number;
  bulkDownloadTokenExpiry: number;
  baseUrl: string;
  email: {
    user: string | undefined;
    pass: string | undefined;
    from: string | undefined;
  };
  smtp: {
    host: string | undefined;
    port: number;
    secure: boolean;
  };
  google: {
    clientId: string | undefined;
    clientSecret: string | undefined;
    callbackUrl: string;
  };
  redis: {
    url: string | undefined;
    forceRedis: boolean;
  };
  rateLimit: {
    enabled: boolean;
    guest: { windowMs: number; max: number };
    auth: { windowMs: number; max: number };
    premium: { windowMs: number; max: number };
    admin: { windowMs: number; max: number };
    skipSuccess: boolean;
    skipFailed: boolean;
    keyPrefix: string;
  };
  /** Immutable audit trail for privileged actions. */
  audit: {
    /** HMAC key for entry integrity hashes; falls back to `jwtSecret`. */
    hmacSecret: string | undefined;
    /** When true, a failed audit write fails the mutation it describes. */
    failClosed: boolean;
  };
  /** Worker upload quarantine, scanning and quota settings. */
  uploads: {
    /** Storage root, kept outside any web-served directory. */
    root: string;
    maxFileBytes: number;
    /** Keep infected samples in `infected/` instead of deleting them. */
    retainInfected: boolean;
    quota: { maxBytes: number; maxFiles: number; windowMs: number };
    scanner: {
      provider: string;
      host: string;
      port: number;
      timeoutMs: number;
    };
  };
  /** Webhook signature verification and replay protection settings. */
  webhook: {
    /** Shared secret for HMAC-SHA256 signature verification. */
    secret: string | undefined;
    /** Maximum age of a webhook timestamp before it is rejected (ms). */
    timestampToleranceMs: number;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/chain-verse',
  jwtSecret: process.env.JWT_SECRET!,
  downloadTokenExpiry: parseInt(
    process.env.DOWNLOAD_TOKEN_EXPIRY ?? '3600',
    10,
  ),
  bulkDownloadTokenExpiry: parseInt(
    process.env.BULK_DOWNLOAD_TOKEN_EXPIRY ?? '7200',
    10,
  ),
  baseUrl: process.env.BASE_URL ?? 'http://localhost:3000',
  email: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    from: process.env.EMAIL_FROM,
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl:
      process.env.CALLBACK_URL ?? 'http://localhost:3000/auth/google/callback',
  },
  redis: {
    url: process.env.REDIS_URL,
    forceRedis: process.env.FORCE_REDIS === 'true',
  },
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    guest: {
      windowMs: parseInt(process.env.RATE_LIMIT_GUEST_WINDOW_MS ?? '60000', 10),
      max: parseInt(process.env.RATE_LIMIT_GUEST_MAX ?? '30', 10),
    },
    auth: {
      windowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS ?? '60000', 10),
      max: parseInt(process.env.RATE_LIMIT_AUTH_MAX ?? '100', 10),
    },
    premium: {
      windowMs: parseInt(
        process.env.RATE_LIMIT_PREMIUM_WINDOW_MS ?? '60000',
        10,
      ),
      max: parseInt(process.env.RATE_LIMIT_PREMIUM_MAX ?? '200', 10),
    },
    admin: {
      windowMs: parseInt(process.env.RATE_LIMIT_ADMIN_WINDOW_MS ?? '60000', 10),
      max: parseInt(process.env.RATE_LIMIT_ADMIN_MAX ?? '500', 10),
    },
    skipSuccess: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true',
    skipFailed: process.env.RATE_LIMIT_SKIP_FAILED === 'true',
    keyPrefix: process.env.RATE_LIMIT_KEY_PREFIX ?? 'rl:',
  },
  audit: {
    hmacSecret: process.env.AUDIT_HMAC_SECRET,
    failClosed: process.env.AUDIT_LOG_FAIL_CLOSED === 'true',
  },
  uploads: {
    root: process.env.UPLOAD_STORAGE_ROOT ?? 'var/uploads',
    maxFileBytes: parseInt(
      process.env.UPLOAD_MAX_FILE_BYTES ?? String(5 * 1024 * 1024),
      10,
    ),
    retainInfected: process.env.UPLOAD_RETAIN_INFECTED === 'true',
    quota: {
      maxBytes: parseInt(
        process.env.UPLOAD_QUOTA_MAX_BYTES ?? String(100 * 1024 * 1024),
        10,
      ),
      maxFiles: parseInt(process.env.UPLOAD_QUOTA_MAX_FILES ?? '20', 10),
      windowMs: parseInt(
        process.env.UPLOAD_QUOTA_WINDOW_MS ?? String(24 * 60 * 60 * 1000),
        10,
      ),
    },
    scanner: {
      provider: process.env.MALWARE_SCAN_PROVIDER ?? 'builtin',
      host: process.env.MALWARE_SCAN_HOST ?? '127.0.0.1',
      port: parseInt(process.env.MALWARE_SCAN_PORT ?? '3310', 10),
      timeoutMs: parseInt(process.env.MALWARE_SCAN_TIMEOUT_MS ?? '30000', 10),
    },
  },
  webhook: {
    secret: process.env.WEBHOOK_SECRET,
    timestampToleranceMs: parseInt(
      process.env.WEBHOOK_TIMESTAMP_TOLERANCE_MS ?? '300000',
      10,
    ),
  },
});
