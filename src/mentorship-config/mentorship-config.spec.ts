import { envValidationSchema } from '../common/config/env.validation';
import { buildMentorshipConfig } from './mentorship-config';
import { MentorshipConfigController } from './mentorship-config.controller';
import { MentorshipConfigService } from './mentorship-config.service';

const BASE = {
  JWT_SECRET: 'super-secure-secret-key-that-is-32-chars!!',
  DATABASE_URL: 'mongodb://localhost:27017/chain-verse',
  JWT_REFRESH_SECRET: 'another-super-secure-refresh-secret!!',
};

const validate = (extra: Record<string, unknown> = {}) =>
  envValidationSchema.validate(
    { ...BASE, ...extra },
    { allowUnknown: true, abortEarly: false },
  );

describe('mentorship env validation', () => {
  it('applies safe defaults: capability and payments off', () => {
    const { error, value } = validate();
    expect(error).toBeUndefined();
    expect(value.MENTORSHIP_ENABLED).toBe(false);
    expect(value.MENTORSHIP_PAYMENTS_ENABLED).toBe(false);
    expect(value.MENTORSHIP_SUPPORTED_CURRENCIES).toBe('USDC,XLM');
    expect(value.MENTORSHIP_SESSION_MIN_MINUTES).toBe(15);
    expect(value.MENTORSHIP_SESSION_MAX_MINUTES).toBe(120);
    expect(value.MENTORSHIP_FREE_CANCELLATION_HOURS).toBe(24);
  });

  it('accepts overrides', () => {
    const { error, value } = validate({
      MENTORSHIP_ENABLED: 'true',
      MENTORSHIP_SESSION_MAX_MINUTES: '90',
      MENTORSHIP_SUPPORTED_CURRENCIES: 'USDC',
    });
    expect(error).toBeUndefined();
    expect(value.MENTORSHIP_ENABLED).toBe(true);
    expect(value.MENTORSHIP_SESSION_MAX_MINUTES).toBe(90);
  });

  it.each([
    ['MENTORSHIP_MAX_ACTIVE_MENTEES_PER_MENTOR', '0'],
    ['MENTORSHIP_MAX_ACTIVE_MENTEES_PER_MENTOR', '1000'],
    ['MENTORSHIP_SESSION_MIN_MINUTES', '1'],
    ['MENTORSHIP_FREE_CANCELLATION_HOURS', '-1'],
    ['MENTORSHIP_EVIDENCE_MAX_MB', '500'],
    ['MENTORSHIP_ENABLED', 'maybe'],
    ['MENTORSHIP_SUPPORTED_CURRENCIES', 'usdc, xlm'],
    ['MENTORSHIP_SUPPORTED_CURRENCIES', ''],
  ])('rejects invalid %s=%s', (key, bad) => {
    expect(validate({ [key]: bad }).error).toBeDefined();
  });

  it('rejects a maximum session shorter than the minimum', () => {
    const { error } = validate({
      MENTORSHIP_SESSION_MIN_MINUTES: '60',
      MENTORSHIP_SESSION_MAX_MINUTES: '30',
    });
    expect(error).toBeDefined();
  });
});

describe('buildMentorshipConfig', () => {
  it('shapes validated values and de-duplicates currencies', () => {
    const { value } = validate({
      MENTORSHIP_ENABLED: 'true',
      MENTORSHIP_PAYMENTS_ENABLED: 'true',
      MENTORSHIP_SUPPORTED_CURRENCIES: 'USDC,XLM,USDC',
    });
    const cfg = buildMentorshipConfig(value);
    expect(cfg.enabled).toBe(true);
    expect(cfg.paymentsEnabled).toBe(true);
    expect(cfg.supportedCurrencies).toEqual(['USDC', 'XLM']);
    expect(cfg.limits.maxActiveMenteesPerMentor).toBe(10);
  });

  it('never reports payments enabled while the capability is off', () => {
    const cfg = buildMentorshipConfig({
      MENTORSHIP_ENABLED: false,
      MENTORSHIP_PAYMENTS_ENABLED: true,
    });
    expect(cfg.paymentsEnabled).toBe(false);
  });

  it('falls back to defaults for an empty environment', () => {
    const cfg = buildMentorshipConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.session).toEqual({ minMinutes: 15, maxMinutes: 120 });
    expect(cfg.evidence.retentionDays).toBe(365);
  });
});

describe('MentorshipConfigController', () => {
  it('exposes the config without leaking unrelated env values', () => {
    const store: Record<string, unknown> = {
      JWT_SECRET: 'must-not-leak',
      MENTORSHIP_ENABLED: true,
    };
    const service = new MentorshipConfigService({
      get: (k: string) => store[k],
    } as never);
    const out = new MentorshipConfigController(service).get();
    expect(out.enabled).toBe(true);
    expect(JSON.stringify(out)).not.toContain('must-not-leak');
  });
});
