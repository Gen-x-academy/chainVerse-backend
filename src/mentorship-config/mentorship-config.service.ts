import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MentorshipConfig, buildMentorshipConfig } from './mentorship-config';

const KEYS = [
  'MENTORSHIP_ENABLED',
  'MENTORSHIP_PAYMENTS_ENABLED',
  'MENTORSHIP_MAX_ACTIVE_MENTEES_PER_MENTOR',
  'MENTORSHIP_MAX_ACTIVE_ENGAGEMENTS_PER_MENTEE',
  'MENTORSHIP_SUPPORTED_CURRENCIES',
  'MENTORSHIP_SESSION_MIN_MINUTES',
  'MENTORSHIP_SESSION_MAX_MINUTES',
  'MENTORSHIP_FREE_CANCELLATION_HOURS',
  'MENTORSHIP_EVIDENCE_MAX_FILES',
  'MENTORSHIP_EVIDENCE_MAX_MB',
  'MENTORSHIP_EVIDENCE_RETENTION_DAYS',
] as const;

@Injectable()
export class MentorshipConfigService {
  constructor(private readonly config: ConfigService) {}

  /** Reads only the whitelisted `MENTORSHIP_*` keys. */
  get(): MentorshipConfig {
    const env: Record<string, unknown> = {};
    for (const key of KEYS) env[key] = this.config.get(key);
    return buildMentorshipConfig(env);
  }

  isEnabled(): boolean {
    return this.get().enabled;
  }
}
