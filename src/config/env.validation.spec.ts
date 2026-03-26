import { envValidationSchema } from './env.validation';

/** Minimal valid env – only the truly required variable is set. */
const VALID_BASE = {
  JWT_SECRET: 'super-secure-secret-key-that-is-32-chars!!',
};

function validate(env: Record<string, unknown>) {
  return envValidationSchema.validate(env, {
    allowUnknown: true,
    abortEarly: false,
  });
}

describe('envValidationSchema', () => {
  // ── JWT_SECRET (required) ────────────────────────────────────────────────

  describe('JWT_SECRET', () => {
    it('accepts a secret that is exactly 32 characters', () => {
      const { error } = validate({ JWT_SECRET: 'a'.repeat(32) });
      expect(error).toBeUndefined();
    });

    it('accepts a secret longer than 32 characters', () => {
      const { error } = validate({ JWT_SECRET: 'a'.repeat(64) });
      expect(error).toBeUndefined();
    });

    it('rejects a missing JWT_SECRET', () => {
      const { error } = validate({});
      expect(error).toBeDefined();
      expect(error!.details.map((d) => d.message).join(' ')).toMatch(
        /JWT_SECRET/,
      );
    });

    it('rejects a JWT_SECRET shorter than 32 characters', () => {
      const { error } = validate({ JWT_SECRET: 'tooshort' });
      expect(error).toBeDefined();
      expect(error!.details.map((d) => d.message).join(' ')).toMatch(
        /JWT_SECRET/,
      );
    });
  });

  // ── PORT ─────────────────────────────────────────────────────────────────

  describe('PORT', () => {
    it('defaults to 3000 when absent', () => {
      const { value } = validate(VALID_BASE);
      expect(value.PORT).toBe(3000);
    });

    it('accepts a valid port number', () => {
      const { error, value } = validate({ ...VALID_BASE, PORT: 8080 });
      expect(error).toBeUndefined();
      expect(value.PORT).toBe(8080);
    });

    it('rejects port 0', () => {
      const { error } = validate({ ...VALID_BASE, PORT: 0 });
      expect(error).toBeDefined();
    });

    it('rejects port above 65535', () => {
      const { error } = validate({ ...VALID_BASE, PORT: 70000 });
      expect(error).toBeDefined();
    });
  });

  // ── NODE_ENV ─────────────────────────────────────────────────────────────

  describe('NODE_ENV', () => {
    it('defaults to development when absent', () => {
      const { value } = validate(VALID_BASE);
      expect(value.NODE_ENV).toBe('development');
    });

    it.each(['development', 'production', 'test'])(
      'accepts NODE_ENV=%s',
      (env) => {
        const { error } = validate({ ...VALID_BASE, NODE_ENV: env });
        expect(error).toBeUndefined();
      },
    );

    it('rejects an unknown NODE_ENV value', () => {
      const { error } = validate({ ...VALID_BASE, NODE_ENV: 'staging' });
      expect(error).toBeDefined();
    });
  });

  // ── MONGO_URI ─────────────────────────────────────────────────────────────

  describe('MONGO_URI', () => {
    it('defaults to localhost when absent', () => {
      const { value } = validate(VALID_BASE);
      expect(value.MONGO_URI).toBe('mongodb://localhost:27017/chain-verse');
    });

    it('accepts a custom MONGO_URI string', () => {
      const uri = 'mongodb+srv://user:pass@cluster.mongodb.net/db';
      const { error, value } = validate({ ...VALID_BASE, MONGO_URI: uri });
      expect(error).toBeUndefined();
      expect(value.MONGO_URI).toBe(uri);
    });
  });

  // ── Optional vars get their defaults ────────────────────────────────────

  describe('optional variables with defaults', () => {
    it('applies default for RATE_LIMIT_ENABLED', () => {
      const { value } = validate(VALID_BASE);
      expect(value.RATE_LIMIT_ENABLED).toBe(true);
    });

    it('applies default for RATE_LIMIT_GUEST_MAX', () => {
      const { value } = validate(VALID_BASE);
      expect(value.RATE_LIMIT_GUEST_MAX).toBe(30);
    });

    it('applies default for DOWNLOAD_TOKEN_EXPIRY', () => {
      const { value } = validate(VALID_BASE);
      expect(value.DOWNLOAD_TOKEN_EXPIRY).toBe(3600);
    });

    it('applies default for FORCE_REDIS', () => {
      const { value } = validate(VALID_BASE);
      expect(value.FORCE_REDIS).toBe(false);
    });

    it('accepts absent optional fields (EMAIL_USER, REDIS_URL, etc.)', () => {
      const { error } = validate(VALID_BASE);
      expect(error).toBeUndefined();
    });
  });

  // ── Unknown OS variables are allowed ────────────────────────────────────

  it('ignores unknown environment variables (e.g. PATH, HOME)', () => {
    const { error } = validate({
      ...VALID_BASE,
      PATH: '/usr/bin:/bin',
      HOME: '/root',
      UNKNOWN_FUTURE_VAR: 'some-value',
    });
    expect(error).toBeUndefined();
  });
});
