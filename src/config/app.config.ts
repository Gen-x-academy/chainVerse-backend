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
});
