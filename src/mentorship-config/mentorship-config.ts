/**
 * Typed view over the validated `MENTORSHIP_*` environment (MENTOR-002).
 *
 * Validation and defaults live in `envValidationSchema`, which runs at startup
 * and refuses to boot on bad values. This module only shapes the already
 * validated values and holds no secrets, so it is safe to expose.
 */
export interface MentorshipConfig {
  enabled: boolean;
  paymentsEnabled: boolean;
  limits: {
    maxActiveMenteesPerMentor: number;
    maxActiveEngagementsPerMentee: number;
  };
  supportedCurrencies: string[];
  session: { minMinutes: number; maxMinutes: number };
  cancellation: { freeWindowHours: number };
  evidence: { maxFiles: number; maxMegabytes: number; retentionDays: number };
}

type Env = Record<string, unknown>;

const num = (env: Env, key: string, fallback: number): number => {
  const raw = env[key];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

const bool = (env: Env, key: string, fallback: boolean): boolean => {
  const raw = env[key];
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
};

export function buildMentorshipConfig(env: Env): MentorshipConfig {
  const currencies = String(env.MENTORSHIP_SUPPORTED_CURRENCIES ?? 'USDC,XLM')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  return {
    enabled: bool(env, 'MENTORSHIP_ENABLED', false),
    // Payments can never be on while the capability itself is off.
    paymentsEnabled:
      bool(env, 'MENTORSHIP_ENABLED', false) &&
      bool(env, 'MENTORSHIP_PAYMENTS_ENABLED', false),
    limits: {
      maxActiveMenteesPerMentor: num(env, 'MENTORSHIP_MAX_ACTIVE_MENTEES_PER_MENTOR', 10),
      maxActiveEngagementsPerMentee: num(env, 'MENTORSHIP_MAX_ACTIVE_ENGAGEMENTS_PER_MENTEE', 3),
    },
    supportedCurrencies: [...new Set(currencies)],
    session: {
      minMinutes: num(env, 'MENTORSHIP_SESSION_MIN_MINUTES', 15),
      maxMinutes: num(env, 'MENTORSHIP_SESSION_MAX_MINUTES', 120),
    },
    cancellation: {
      freeWindowHours: num(env, 'MENTORSHIP_FREE_CANCELLATION_HOURS', 24),
    },
    evidence: {
      maxFiles: num(env, 'MENTORSHIP_EVIDENCE_MAX_FILES', 5),
      maxMegabytes: num(env, 'MENTORSHIP_EVIDENCE_MAX_MB', 10),
      retentionDays: num(env, 'MENTORSHIP_EVIDENCE_RETENTION_DAYS', 365),
    },
  };
}
