import { envValidationSchema } from '../common/config/env.validation';

/** Minimal valid env – the truly required variables are set. */
const VALID_BASE = {
  JWT_SECRET: 'super-secure-secret-key-that-is-32-chars!!',
  DATABASE_URL: 'mongodb://localhost:27017/chain-verse',
  JWT_REFRESH_SECRET: 'another-super-secure-refresh-secret!!',
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
      const { error } = validate({
        ...VALID_BASE,
        JWT_SECRET: 'a'.repeat(32),
      });
      expect(error).toBeUndefined();
    });

    it('accepts a secret longer than 32 characters', () => {
      const { error } = validate({
        ...VALID_BASE,
        JWT_SECRET: 'a'.repeat(64),
      });
      expect(error).toBeUndefined();
    });

    it('rejects a missing JWT_SECRET', () => {
      const { error } = validate({
        DATABASE_URL: 'mongodb://localhost:27017/chain-verse',
        JWT_REFRESH_SECRET: 'another-super-secure-refresh-secret!!',
      });
      expect(error).toBeDefined();
      expect(error!.details.map((d) => d.message).join(' ')).toMatch(
        /JWT_SECRET/,
      );
    });

    it('rejects a JWT_SECRET shorter than 32 characters', () => {
      const { error } = validate({
        ...VALID_BASE,
        JWT_SECRET: 'tooshort',
      });
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

    it.each(['development', 'test'])(
      'accepts NODE_ENV=%s',
      (env) => {
        const { error } = validate({ ...VALID_BASE, NODE_ENV: env });
        expect(error).toBeUndefined();
      },
    );

    it('rejects unknown NODE_ENV', () => {
      const { error } = validate({ ...VALID_BASE, NODE_ENV: 'staging' });
      expect(error).toBeDefined();
    });
  });

  // ── DATABASE_URL (required) ──────────────────────────────────────────────

  describe('DATABASE_URL', () => {
    it('rejects missing DATABASE_URL', () => {
      const { error } = validate({
        JWT_SECRET: 'super-secure-secret-key-that-is-32-chars!!',
        JWT_REFRESH_SECRET: 'another-super-secure-refresh-secret!!',
      });
      expect(error).toBeDefined();
      expect(error!.details.map((d) => d.message).join(' ')).toMatch(
        /DATABASE_URL/,
      );
    });
  });

  // ── Optional vars ───────────────────────────────────────────────────────

  describe('optional variables', () => {
    it('accepts absent optional fields', () => {
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

  // ── Contract address validation (production-required) ───────────────────

  describe('contract addresses in production', () => {
    const contractVars = [
      'CONTRACT_CERTIFICATES',
      'CONTRACT_REWARD',
      'CONTRACT_ESCROW',
      'CONTRACT_CHV_TOKEN',
      'CONTRACT_COURSE_REGISTRY',
    ];

    const prodBase = {
      ...VALID_BASE,
      NODE_ENV: 'production',
      STELLAR_BACKEND_SECRET: 'super-secure-stellar-backend-secret!!!',
    };

    it.each(contractVars)(
      'rejects missing %s in production mode',
      (varName) => {
        const { error } = validate(prodBase);
        expect(error).toBeDefined();
        expect(error!.details.map((d) => d.message).join(' ')).toMatch(
          new RegExp(varName),
        );
      },
    );

    it.each(contractVars)(
      'rejects empty %s in production mode',
      (varName) => {
        const env: Record<string, unknown> = {
          ...prodBase,
          CONTRACT_CERTIFICATES: 'C...cert-contract',
          CONTRACT_REWARD: 'C...reward-contract',
          CONTRACT_ESCROW: 'C...escrow-contract',
          CONTRACT_CHV_TOKEN: 'C...token-contract',
          CONTRACT_COURSE_REGISTRY: 'C...registry-contract',
        };
        env[varName] = '';
        const { error } = validate(env);
        expect(error).toBeDefined();
        expect(error!.details.map((d) => d.message).join(' ')).toMatch(
          new RegExp(varName),
        );
      },
    );

    it('accepts all contract addresses present in production', () => {
      const { error } = validate({
        ...prodBase,
        CONTRACT_CERTIFICATES: 'C...cert-contract',
        CONTRACT_REWARD: 'C...reward-contract',
        CONTRACT_ESCROW: 'C...escrow-contract',
        CONTRACT_CHV_TOKEN: 'C...token-contract',
        CONTRACT_COURSE_REGISTRY: 'C...registry-contract',
      });
      expect(error).toBeUndefined();
    });

    it('allows missing contract addresses in development', () => {
      const { error } = validate({
        ...VALID_BASE,
        NODE_ENV: 'development',
      });
      expect(error).toBeUndefined();
    });
  });
});
